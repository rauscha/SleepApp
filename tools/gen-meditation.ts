#!/usr/bin/env node
/**
 * gen-meditation.ts — generate a bundled sleep meditation.
 *
 * Calls Claude to write the script, ElevenLabs to synthesize it, then
 * saves the MP3 and updates public/meditations/index.json. Run once per
 * meditation; the output ships with the app (zero per-user cost).
 *
 * Prerequisites:
 *   npm install -g tsx        (or: npx tsx tools/gen-meditation.ts …)
 *   export ANTHROPIC_API_KEY=sk-ant-…
 *   export ELEVEN_LABS_API_KEY=…
 *
 * Usage:
 *   npx tsx tools/gen-meditation.ts \
 *     --title "Evening body scan" \
 *     --style body-scan \
 *     --voice hush \
 *     --id   evening-body-scan
 *
 * Arguments (all optional — defaults shown):
 *   --title   Human-readable title displayed in the Library
 *   --style   body-scan | breath-focus | visualization  (default: body-scan)
 *   --voice   hush | ember | glen  (default: hush)
 *   --id      Filename stem, e.g. "morning-scan" → morning-scan.mp3
 *             (defaults to a kebab-case version of --title)
 */

import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const MEDITATIONS_DIR = join(REPO_ROOT, 'public', 'meditations');
const INDEX_PATH = join(MEDITATIONS_DIR, 'index.json');

// ---------------------------------------------------------------------------
// Voice map — custom voices from the ElevenLabs Voice Design portal.
// These are the meditation voices; story voices (tide, design) live in
// src/services/storyGenerator.ts.

const VOICE_IDS: Record<string, string> = {
  hush:  'mZTVERjx1WQkdAWt1Lcm', // Grace  — soft female
  ember: '1mrmwdWVC5cggRCdxBXt', // Monika — warm female
  glen:  'iRItcIx4sdrKJ1k6Ovv7', // Jerry  — male
};

// ---------------------------------------------------------------------------
// Prompts

function buildPrompt(style: string): string {
  if (style === 'breath-focus') {
    return `You write deliberate, calming breath-focus meditations for adults preparing for sleep.

Rules:
- 900–1100 words (8–10 minutes at slow pace).
- Guide attention to the breath: its rhythm, depth, the pause between exhale and inhale.
- Language is slow, even, and pleasantly repetitive. Use second person ("notice your breath…").
- Every 2–3 sentences insert [pause] (half-second beat) or [softly] before a phrase to be gentle.
- No visualization of active scenes. No excitement. No abrupt transitions.
- End with the listener already nearly asleep.

Output ONLY the meditation script. No title. No preamble.`;
  }

  if (style === 'visualization') {
    return `You write deliberate, calming sleep visualizations for adults.

Rules:
- 900–1100 words.
- Guide the listener through a calm, still environment: a quiet forest clearing, a still lake at dusk, an empty beach at night.
- All sensory details are peaceful: soft textures, cool air, quiet sounds, darkness.
- Every 2–3 sentences insert [pause] or [softly] before a gentle phrase.
- No sudden sounds, no movement, no tension.
- End with the listener settling into stillness.

Output ONLY the meditation script. No title. No preamble.`;
  }

  // Default: body-scan
  return `You write deliberate, calming body-scan meditations for adults preparing for sleep.

Rules:
- 900–1100 words (8–10 minutes at slow pace).
- Guide attention methodically through the body: feet → legs → hips → belly → chest → arms → shoulders → face → scalp.
- Language is slow, even, and pleasantly repetitive. Use second person ("allow your feet to soften…").
- Every 2–3 sentences insert [pause] (half-second beat) or [softly] before a phrase to be gentle.
- No excitement. No abrupt transitions. The progression should feel like sinking.
- End with the whole body relaxed, the listener nearly asleep.

Output ONLY the meditation script. No title. No preamble.`;
}

// ---------------------------------------------------------------------------
// Arg parsing

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, def = '') => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
  };
  return {
    title: get('--title', 'Evening body scan'),
    style: get('--style', 'body-scan') as 'body-scan' | 'breath-focus' | 'visualization',
    voice: get('--voice', 'hush') as 'hush' | 'ember' | 'glen',
    id:    get('--id', ''),
  };
}

function toKebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// API helpers

async function callClaude(apiKey: string, style: string): Promise<string> {
  console.log('  ⟳  Writing script with Claude…');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type':       'application/json',
      'x-api-key':          apiKey,
      'anthropic-version':  '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: buildPrompt(style),
      messages: [{ role: 'user', content: 'Write the meditation.' }],
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

async function callElevenLabs(
  apiKey: string,
  voiceId: string,
  text: string
): Promise<Buffer> {
  console.log('  ⟳  Synthesizing with ElevenLabs…');
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'xi-api-key':   apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.8,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 300)}`);
  }
  const buf = await res.arrayBuffer();
  console.log(`  ✓  Audio ready (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  return Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// Main

async function main() {
  const anthropicKey  = process.env['ANTHROPIC_API_KEY'];
  const elevenLabsKey = process.env['ELEVEN_LABS_API_KEY'];

  if (!anthropicKey) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }
  if (!elevenLabsKey) {
    console.error('ERROR: ELEVEN_LABS_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const { title, style, voice, id: rawId } = parseArgs();
  const id = rawId || toKebab(title);
  const audioPath = `${id}.mp3`;
  const voiceId = VOICE_IDS[voice];
  if (!voiceId) {
    console.error(`ERROR: unknown voice "${voice}". Valid: hush, ember, glen`);
    process.exit(1);
  }

  console.log(`\nGenerating meditation: "${title}"`);
  console.log(`  style: ${style}  |  voice: ${voice}  |  id: ${id}\n`);

  // 1. Generate script
  const script = await callClaude(anthropicKey, style);

  // 2. Synthesize
  const audioData = await callElevenLabs(elevenLabsKey, voiceId, script);

  // 3. Save MP3
  mkdirSync(MEDITATIONS_DIR, { recursive: true });
  const audioFilePath = join(MEDITATIONS_DIR, audioPath);
  writeFileSync(audioFilePath, audioData);
  console.log(`  ✓  Saved ${audioFilePath}`);

  // 4. Update index.json
  const wordCount = script.trim().split(/\s+/).length;
  const durationSeconds = Math.round((wordCount / 115) * 60); // ~115 wpm slow narration

  let index: { meditations: object[] } = { meditations: [] };
  try {
    index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    /* first meditation — index will be created */
  }

  // Remove any existing entry with the same id before re-adding.
  index.meditations = (index.meditations as Array<{ id: string }>).filter(
    (m) => m.id !== id
  );

  index.meditations.push({
    id,
    title,
    description: `A ${style.replace('-', ' ')} meditation.`,
    style,
    durationSeconds,
    voiceId: voice,
    createdAt: new Date().toISOString(),
    audioPath,
  });

  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  console.log(`  ✓  Updated ${INDEX_PATH}`);
  console.log(`\nDone! Commit public/meditations/ and rebuild the app.\n`);
}

main().catch((err) => {
  console.error('\n✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
