#!/usr/bin/env node
/**
 * gen-story.ts — generate a bundled sleep story.
 *
 * The CLI counterpart to src/services/storyGenerator.ts (which runs in
 * the browser and persists to IndexedDB). This tool calls the same
 * Anthropic + ElevenLabs APIs but writes the output to public/stories/
 * so the MP3 ships baked into the app — useful for cold-start library
 * content that doesn't require the user to generate first.
 *
 * The system prompt is a copy of STORY_SYSTEM_PROMPT in storyGenerator.ts.
 * If you tune one, tune the other. (The duplication is deliberate: this
 * file runs in Node and the in-app version uses import.meta.env, so a
 * shared module would need a refactor we don't need yet.)
 *
 * Long-form path: stories are 2800–3200 words, well past the 5K-char
 * standard TTS limit. This CLI uses ElevenLabs Projects API for the
 * whole script in one request; if Projects errors, it falls back to
 * chunked TTS at paragraph boundaries + MP3 byte-concat (identical to
 * the in-app fallback).
 *
 * Prerequisites:
 *   npm install -g tsx     (or: npx tsx tools/gen-story.ts …)
 *   export ANTHROPIC_API_KEY=sk-ant-…
 *   export ELEVEN_LABS_API_KEY=…
 *
 * Usage:
 *   # Fresh generation.
 *   npx tsx tools/gen-story.ts \
 *     --title "Seaside village" \
 *     --theme "a slow walk through an empty seaside village after dark" \
 *     --voice tide \
 *     --id    seaside-village
 *
 *   # Re-render from an edited script (Claude not called).
 *   npx tsx tools/gen-story.ts \
 *     --title "Seaside village" \
 *     --theme "..." \
 *     --voice tide \
 *     --id    seaside-village \
 *     --script public/stories/seaside-village.txt
 *
 * Arguments:
 *   --title   Human-readable title displayed in the Library.
 *   --theme   Short prompt sent to Claude (also shown as the card subtitle).
 *   --voice   tide | stone  (default: tide)
 *   --id      Filename stem, e.g. "seaside-village" → seaside-village.mp3
 *             (defaults to a kebab-case version of --title)
 *   --script  Path to a .txt file to use instead of generating with Claude.
 */

import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const STORIES_DIR = join(REPO_ROOT, 'public', 'stories');
const INDEX_PATH = join(STORIES_DIR, 'index.json');

// ---------------------------------------------------------------------------
// Voice map — story narrators. Reads VITE_VOICE_TIDE/STONE env vars to stay
// in sync with the browser bundle; hardcoded fallback reflects current
// portal IDs as of 2026-05-17.

const VOICE_IDS: Record<string, string> = {
  tide:  process.env['VITE_VOICE_TIDE']  || 'jv41DhCf464zw0TI7I1w',
  stone: process.env['VITE_VOICE_STONE'] || 'oae6GCCzwoEbfc5FHdEu',
};

// ---------------------------------------------------------------------------
// Prompt — kept in sync with STORY_SYSTEM_PROMPT in
// src/services/storyGenerator.ts.

const STORY_SYSTEM_PROMPT = `You write deliberate, calming sleep stories for adults. Your goal is to induce sleep, not to entertain.

Rules:
- 2800–3200 words. Every word must earn its place.
- Arc: orient (where/who/when) → settle (sensory grounding) → drift (progressive vagueness, dream-adjacent). The listener should be asleep before the end.
- Prose must be soft, pleasantly repetitive, and monotonous. No twists. No tension. No unresolved stakes.
- Sensory detail: cool air, soft light, distant water, stillness, warmth. Nothing sharp or surprising.
- Every 3–5 sentences insert one of: [pause] (half-second beat) or [softly] before a phrase to be spoken gently.
- It is fine — even good — to end mid-sentence. The listener is already asleep.
- No alarms. No traffic. No urgent tasks. No emotional drama.
- Use second person ("you walk through…") for grounding.

Output ONLY the story text. No title, no preamble, no quotation marks.`;

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const TTS_CHUNK_LIMIT = 4500;
const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_MS = 20 * 60 * 1000;

// ---------------------------------------------------------------------------
// Arg parsing

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, def = '') => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
  };
  return {
    title:  get('--title', 'Sleep story'),
    theme:  get('--theme', ''),
    voice:  get('--voice', 'tide') as 'tide' | 'stone',
    id:     get('--id', ''),
    script: get('--script', ''),
  };
}

function toKebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Claude

async function callClaude(apiKey: string, theme: string): Promise<string> {
  console.log('  ⟳  Writing script with Claude…');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: STORY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Write a sleep story. Theme: ${theme}` }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
  const text = data.content.find((b) => b.type === 'text')?.text ?? '';
  if (!text) throw new Error('Claude returned empty content.');
  console.log(`  ✓  Script ready (${text.trim().split(/\s+/).length} words)`);
  return text;
}

// ---------------------------------------------------------------------------
// ElevenLabs — Projects API path (preferred for long-form)

async function callElevenLabsProjects(
  apiKey: string,
  voiceId: string,
  text: string
): Promise<Buffer> {
  const headers = {
    'content-type': 'application/json',
    'xi-api-key':   apiKey,
  };

  console.log('  ⟳  Creating Projects job…');
  const createRes = await fetch(`${ELEVENLABS_BASE}/v1/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `bundled-story-${Date.now()}`,
      default_title_voice_id:     voiceId,
      default_paragraph_voice_id: voiceId,
      default_model_id:           'eleven_multilingual_v2',
      content: text,
    }),
  });
  if (!createRes.ok) {
    throw new Error(
      `Projects create ${createRes.status}: ${(await createRes.text()).slice(0, 300)}`
    );
  }
  const created = (await createRes.json()) as {
    project_id?: string;
    project?: { project_id: string };
    chapter_id?: string;
    chapters?: Array<{ chapter_id: string }>;
  };
  const projectId = created.project_id ?? created.project?.project_id;
  if (!projectId) throw new Error('Projects: no project_id in create response.');

  // Add content if create response didn't already attach a chapter.
  if (!created.chapter_id && !created.chapters?.length) {
    const contentRes = await fetch(
      `${ELEVENLABS_BASE}/v1/projects/${projectId}/content`,
      { method: 'POST', headers, body: JSON.stringify({ content: text }) }
    );
    if (!contentRes.ok && contentRes.status >= 500) {
      throw new Error(
        `Projects content ${contentRes.status}: ${(await contentRes.text()).slice(0, 300)}`
      );
    }
  }

  console.log('  ⟳  Converting (1–3 min for ~3K words)…');
  const convertRes = await fetch(
    `${ELEVENLABS_BASE}/v1/projects/${projectId}/convert`,
    { method: 'POST', headers }
  );
  if (!convertRes.ok) {
    throw new Error(
      `Projects convert ${convertRes.status}: ${(await convertRes.text()).slice(0, 300)}`
    );
  }

  const chapterId = await pollUntilConverted(apiKey, projectId);

  console.log('  ⟳  Downloading audio…');
  const audioRes = await fetch(
    `${ELEVENLABS_BASE}/v1/projects/${projectId}/chapters/${chapterId}/audio`,
    { headers: { 'xi-api-key': apiKey } }
  );
  if (!audioRes.ok) {
    throw new Error(
      `Projects audio ${audioRes.status}: ${(await audioRes.text()).slice(0, 300)}`
    );
  }
  const buf = await audioRes.arrayBuffer();
  console.log(`  ✓  Audio ready (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  return Buffer.from(buf);
}

async function pollUntilConverted(apiKey: string, projectId: string): Promise<string> {
  const started = Date.now();
  let lastLogged = '';
  while (true) {
    if (Date.now() - started > POLL_MAX_MS) {
      throw new Error(`Projects: still pending after ${POLL_MAX_MS / 1000}s.`);
    }
    const res = await fetch(`${ELEVENLABS_BASE}/v1/projects/${projectId}`, {
      headers: { 'xi-api-key': apiKey },
    });
    if (!res.ok) {
      throw new Error(`Projects status ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      status?: string;
      project?: { status?: string };
      chapters?: Array<{ chapter_id: string }>;
      chapter_id?: string;
    };
    const status = data.status ?? data.project?.status ?? '';
    if (status !== lastLogged) {
      const elapsed = Math.round((Date.now() - started) / 1000);
      console.log(`    [${elapsed}s] status: ${status}`);
      lastLogged = status;
    }
    if (status === 'converted' || status === 'done') {
      const chapterId = data.chapter_id ?? data.chapters?.[0]?.chapter_id;
      if (!chapterId) throw new Error('Projects: converted but no chapter_id.');
      return chapterId;
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`Projects: conversion reported status "${status}".`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

// ---------------------------------------------------------------------------
// ElevenLabs — chunked-TTS fallback

function chunkScript(text: string, maxChars = TTS_CHUNK_LIMIT): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const paragraphs = trimmed.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const para of paragraphs) {
    if (para.length > maxChars) {
      flush();
      // Sentence-level split for over-long paragraphs.
      const sentences = para.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [para];
      for (const sent of sentences) {
        const piece = sent.length > maxChars ? sent.slice(0, maxChars) : sent;
        if (current.length + piece.length + 1 > maxChars) flush();
        current = current ? current + ' ' + piece : piece;
      }
      continue;
    }
    if (current.length + para.length + 2 > maxChars) flush();
    current = current ? current + '\n\n' + para : para;
  }
  flush();
  return chunks;
}

async function callElevenLabsChunked(
  apiKey: string,
  voiceId: string,
  text: string
): Promise<Buffer> {
  const chunks = chunkScript(text);
  if (chunks.length === 0) throw new Error('Empty script — nothing to synthesize.');
  console.log(`  ⟳  Chunked TTS fallback: ${chunks.length} chunks…`);

  const buffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`    Chunk ${i + 1}/${chunks.length}…`);
    const res = await fetch(`${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({
        text: chunks[i]!,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Chunk ${i + 1} TTS ${res.status}: ${(await res.text()).slice(0, 300)}`
      );
    }
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  const total = buffers.reduce((n, b) => n + b.byteLength, 0);
  console.log(`  ✓  Audio ready (${(total / 1024 / 1024).toFixed(1)} MB, ${buffers.length} chunks)`);
  return Buffer.concat(buffers);
}

// ---------------------------------------------------------------------------
// Dispatcher

async function synthesize(
  apiKey: string,
  voiceId: string,
  text: string
): Promise<Buffer> {
  try {
    return await callElevenLabsProjects(apiKey, voiceId, text);
  } catch (err) {
    console.warn(`  ⚠  Projects API failed (${err instanceof Error ? err.message : err}); falling back to chunked TTS.`);
    return callElevenLabsChunked(apiKey, voiceId, text);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main

async function main() {
  const elevenLabsKey = process.env['ELEVEN_LABS_API_KEY'];
  if (!elevenLabsKey) {
    console.error('ERROR: ELEVEN_LABS_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const { title, theme, voice, id: rawId, script: scriptPath } = parseArgs();
  if (!theme && !scriptPath) {
    console.error('ERROR: --theme is required when --script is not given.');
    process.exit(1);
  }

  const id = rawId || toKebab(title);
  const audioPath = `${id}.mp3`;
  const voiceId = VOICE_IDS[voice];
  if (!voiceId) {
    console.error(`ERROR: unknown voice "${voice}". Valid: tide, stone`);
    process.exit(1);
  }

  console.log(`\nGenerating sleep story: "${title}"`);
  console.log(`  voice: ${voice}  |  id: ${id}`);
  console.log(scriptPath ? `  source: ${scriptPath}\n` : `  source: Claude (theme: ${theme})\n`);

  let script: string;
  if (scriptPath) {
    script = readFileSync(scriptPath, 'utf8');
    console.log(`  ✓  Loaded script from ${scriptPath} (${script.trim().split(/\s+/).length} words)`);
  } else {
    const anthropicKey = process.env['ANTHROPIC_API_KEY'];
    if (!anthropicKey) {
      console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
      process.exit(1);
    }
    script = await callClaude(anthropicKey, theme);
  }

  // Save script sidecar for hand-editing + re-render via --script.
  mkdirSync(STORIES_DIR, { recursive: true });
  const scriptFilePath = join(STORIES_DIR, `${id}.txt`);
  writeFileSync(scriptFilePath, script);
  console.log(`  ✓  Saved ${scriptFilePath}`);

  // Synthesize (Projects → chunked fallback).
  const audioData = await synthesize(elevenLabsKey, voiceId, script);

  const audioFilePath = join(STORIES_DIR, audioPath);
  writeFileSync(audioFilePath, audioData);
  console.log(`  ✓  Saved ${audioFilePath}`);

  // Update index.json. 130 wpm matches the slow narration pace in
  // estimateDurationSeconds() in src/services/storyGenerator.ts.
  const wordCount = script.trim().split(/\s+/).length;
  const durationSeconds = Math.round((wordCount / 130) * 60);

  let index: { stories: object[] } = { stories: [] };
  try {
    index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    /* first story — index will be created */
  }
  index.stories = (index.stories as Array<{ id: string }>).filter((s) => s.id !== id);
  index.stories.push({
    id,
    title,
    theme: theme || `(re-rendered from ${scriptPath})`,
    voiceId: voice,
    createdAt: new Date().toISOString(),
    durationSeconds,
    audioPath,
  });

  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  console.log(`  ✓  Updated ${INDEX_PATH}`);
  console.log(`\nDone! Commit public/stories/ and rebuild the app.\n`);
}

main().catch((err) => {
  console.error('\n✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
