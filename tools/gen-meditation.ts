#!/usr/bin/env node
/**
 * gen-meditation.ts — generate a bundled sleep meditation.
 *
 * Calls Claude to write the script, ElevenLabs to synthesize it, then
 * saves the MP3 (and a sidecar .txt of the script) and updates
 * public/meditations/index.json. Run once per meditation; the output ships
 * with the app (zero per-user cost).
 *
 * The sidecar .txt is editable — pass `--script <path>` to skip Claude
 * and synthesize directly from a hand-edited script.
 *
 * Prerequisites:
 *   npm install -g tsx        (or: npx tsx tools/gen-meditation.ts …)
 *   export ANTHROPIC_API_KEY=sk-ant-…
 *   export ELEVEN_LABS_API_KEY=…
 *
 * Usage:
 *   # Fresh generation: Claude writes, ElevenLabs synthesizes.
 *   npx tsx tools/gen-meditation.ts \
 *     --title "Evening body scan" \
 *     --style body-scan \
 *     --voice hush \
 *     --id   evening-body-scan
 *
 *   # Re-render from an edited script (Claude not called).
 *   npx tsx tools/gen-meditation.ts \
 *     --title "Evening body scan" \
 *     --voice hush \
 *     --id   evening-body-scan \
 *     --script public/meditations/evening-body-scan.txt
 *
 * Arguments (all optional — defaults shown):
 *   --title   Human-readable title displayed in the Library
 *   --style   body-scan | breath-focus | visualization  (default: body-scan)
 *   --voice   hush | ember | glen  (default: hush)
 *   --id      Filename stem, e.g. "morning-scan" → morning-scan.mp3
 *             (defaults to a kebab-case version of --title)
 *   --script  Path to a .txt file to use instead of generating with Claude.
 *             Stage-direction markers like [pause] are still stripped
 *             before TTS, so you may keep or remove them as you prefer.
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
// Reads the same VITE_VOICE_* env vars the browser bundle uses so the CLI
// and the app stay in sync. Hardcoded fallbacks reflect the current
// design portal IDs as of 2026-05-17.
//
// Story voices (tide, stone) live in src/services/storyGenerator.ts.

const VOICE_IDS: Record<string, string> = {
  hush:  process.env['VITE_VOICE_HUSH']  || 'bgU7lBMo69PNEOWHFqxM',
  ember: process.env['VITE_VOICE_EMBER'] || 'gc5LArFpEOmYx9nYmK9l',
  glen:  process.env['VITE_VOICE_GLEN']  || 'UmQN7jS1Ee8B1czsUtQh',
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
    title:  get('--title', 'Evening body scan'),
    style:  get('--style', 'body-scan') as 'body-scan' | 'breath-focus' | 'visualization',
    voice:  get('--voice', 'hush') as 'hush' | 'ember' | 'glen',
    id:     get('--id', ''),
    script: get('--script', ''),
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

/**
 * Strip Claude's stage-direction markers ([pause], [softly], [long pause]…)
 * from the script before it goes to ElevenLabs. The markers were authored
 * for human prosody guidance; the TTS engine reads them out loud verbatim
 * ("bracket pause bracket"), which is jarring at 2am. We convert [pause]
 * variants to a real comma+ellipsis (which the engine respects as a beat)
 * and drop the speaker-tone markers entirely (the slowed voice settings
 * already deliver a gentle delivery).
 */
export function stripMeditationMarkers(text: string): string {
  return text
    // [long pause] / [pause] / [pause for a moment] → comma + ellipsis
    .replace(/\[(?:long\s+)?pause(?:[^\]]*)\]/gi, ', …')
    // [softly] / [whisper] / [gently] etc. — drop the marker, keep flow
    .replace(/\[(?:softly|whisper(?:ing)?|gently|quietly|slowly)\]/gi, '')
    // Any other bracketed stage direction we didn't anticipate
    .replace(/\[[^\]]{1,40}\]/g, '')
    // Collapse the whitespace we just introduced
    .replace(/[ \t]+/g, ' ')
    .replace(/ ,/g, ',')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

async function callElevenLabs(
  apiKey: string,
  voiceId: string,
  text: string
): Promise<Buffer> {
  console.log('  ⟳  Synthesizing with ElevenLabs…');
  const cleaned = stripMeditationMarkers(text);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'xi-api-key':   apiKey,
      },
      body: JSON.stringify({
        text: cleaned,
        model_id: 'eleven_multilingual_v2',
        // Tuned for bedtime narration:
        //   speed:0.80      — slower than the 0.85 first pass; the
        //                     mid-meditation prosody at 0.85 still
        //                     accelerated noticeably through short
        //                     consecutive sentences. 0.80 is roughly
        //                     the slowest setting before "stretched"
        //                     artifacts appear.
        //   stability:0.95  — high stability damps the within-render
        //                     pace variation that made the 0.85 render
        //                     feel uneven; the voice should hold the
        //                     slow cadence end-to-end.
        //   style:0.0       — no conversational lift; flat editorial
        //                     read.
        //   similarity_boost:0.75 + use_speaker_boost:true — leave
        //                     as defaults.
        voice_settings: {
          stability: 0.95,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
          speed: 0.80,
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
  const elevenLabsKey = process.env['ELEVEN_LABS_API_KEY'];
  if (!elevenLabsKey) {
    console.error('ERROR: ELEVEN_LABS_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const { title, style, voice, id: rawId, script: scriptPath } = parseArgs();
  const id = rawId || toKebab(title);
  const audioPath = `${id}.mp3`;
  const voiceId = VOICE_IDS[voice];
  if (!voiceId) {
    console.error(`ERROR: unknown voice "${voice}". Valid: hush, ember, glen`);
    process.exit(1);
  }

  console.log(`\nGenerating meditation: "${title}"`);
  console.log(`  style: ${style}  |  voice: ${voice}  |  id: ${id}`);
  console.log(scriptPath ? `  source: ${scriptPath}\n` : `  source: Claude\n`);

  // 1. Acquire script — either from file or from Claude.
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
    script = await callClaude(anthropicKey, style);
  }

  // 2. Save the script as a sidecar .txt so it can be hand-edited and
  // re-rendered later with --script. We save the raw script (markers
  // intact) — stripMeditationMarkers runs in callElevenLabs anyway,
  // and keeping [pause] tags lets the human editor see Claude's
  // pacing intent.
  mkdirSync(MEDITATIONS_DIR, { recursive: true });
  const scriptFilePath = join(MEDITATIONS_DIR, `${id}.txt`);
  writeFileSync(scriptFilePath, script);
  console.log(`  ✓  Saved ${scriptFilePath}`);

  // 3. Synthesize
  const audioData = await callElevenLabs(elevenLabsKey, voiceId, script);

  // 4. Save MP3
  const audioFilePath = join(MEDITATIONS_DIR, audioPath);
  writeFileSync(audioFilePath, audioData);
  console.log(`  ✓  Saved ${audioFilePath}`);

  // 5. Update index.json
  const wordCount = script.trim().split(/\s+/).length;
  const durationSeconds = Math.round((wordCount / 115) * 60); // ~115 wpm slow narration

  interface IndexEntry {
    id: string;
    title: string;
    description: string;
    style: string;
    durationSeconds: number;
    voiceId: string;
    createdAt: string;
    audioPath: string;
  }

  let index: { meditations: IndexEntry[] } = { meditations: [] };
  try {
    index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    /* first meditation — index will be created */
  }

  // When re-rendering an existing meditation (same id), preserve the
  // existing entry's curated metadata — the CLI args have defaults
  // (style:body-scan, title:"Evening body scan") that would otherwise
  // silently overwrite hand-set values. Always update durationSeconds
  // (script edits change pace) and the audioPath (stable but cheap to
  // overwrite). createdAt is preserved so the entry doesn't claim to
  // be brand-new every time we re-render.
  const existingIdx = index.meditations.findIndex((m) => m.id === id);
  const existing = existingIdx >= 0 ? index.meditations[existingIdx] : null;

  const entry: IndexEntry = {
    id,
    title:       existing?.title       ?? title,
    description: existing?.description ?? `A ${style.replace('-', ' ')} meditation.`,
    style:       existing?.style       ?? style,
    durationSeconds,
    voiceId:     existing?.voiceId     ?? voice,
    createdAt:   existing?.createdAt   ?? new Date().toISOString(),
    audioPath,
  };

  if (existingIdx >= 0) {
    index.meditations[existingIdx] = entry;
  } else {
    index.meditations.push(entry);
  }

  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  console.log(`  ✓  Updated ${INDEX_PATH}`);
  console.log(`\nDone! Commit public/meditations/ and rebuild the app.\n`);
}

main().catch((err) => {
  console.error('\n✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
