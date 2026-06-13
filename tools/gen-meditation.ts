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
import { normalizeVoiceMp3 } from './normalize-voice-audio';

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

// Shared craft, lifted to match the sleep-story prompt (the project's gold
// standard) per roadmap 6.5 — the meditations were boilerplate "body scan"
// fare; invest the same voice the stories got: a real arc, progressive
// vagueness, and permission to trail off because the listener is already
// asleep before the end.
const SHARED_CRAFT = `Your goal is to put the listener to sleep, not to instruct or improve them — no wellness language, no "be present," no benefits, no metaphors that ask for thought.

Voice:
- Second person, soft, slow, and pleasantly monotonous. Repetition is a feature, not a flaw.
- An arc from orient (settle in, where the body is) → deepen (the practice itself) → drift (progressively vaguer, dream-adjacent, the words loosening).
- Every 2–3 sentences, insert [pause] (a held beat) or [softly] before a phrase meant to be barely spoken.
- The last third should thin out — shorter phrases, longer pauses, sense giving way to sensation. It is fine — good, even — to trail off mid-thought near the end. The listener won't hear the finish.
- Never anything sharp: no counting that demands focus, no "now do X," no startling image, no resolution to chase.`;

function buildPrompt(style: string): string {
  if (style === 'breath-focus') {
    return `You write deliberate, calming breath-focus meditations for adults who want to fall asleep.

${SHARED_CRAFT}

This one:
- 900–1100 words (8–10 minutes at a slow pace).
- Rest attention on the breath — its weight, the warmth of the exhale, the still pause before the next one arrives. Let the breath slow on its own; never command it.
- Return to the breath gently each time the mind wanders, without judgement, until returning and breathing blur together.

Output ONLY the meditation script. No title. No preamble.`;
  }

  if (style === 'visualization') {
    return `You write deliberate, calming sleep visualizations for adults who want to fall asleep.

${SHARED_CRAFT}

This one:
- 900–1100 words.
- One still, dim place held the whole way through — a quiet forest clearing at dusk, a windless lake under low cloud, an empty beach after dark. Don't travel; stay, and let detail settle like silt.
- Every detail soft and cool: muffled sound, slow air, fading light, nothing that moves quickly or asks to be watched.

Output ONLY the meditation script. No title. No preamble.`;
  }

  // Default: body-scan
  return `You write deliberate, calming body-scan meditations for adults who want to fall asleep.

${SHARED_CRAFT}

This one:
- 900–1100 words (8–10 minutes at a slow pace).
- Move attention slowly through the body — feet → legs → hips → belly → chest → arms → shoulders → face → scalp — letting each part grow heavy and warm and be left behind.
- The descent should feel like sinking, each region softer than the last, until the body is one heavy, settled weight.

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
    // Editorial one-line description for the Library card (roadmap 6.5).
    // Falls back to the boilerplate only when omitted — prefer to pass one.
    description: get('--description', ''),
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
 * ("bracket pause bracket"), which is jarring at 2am.
 *
 * Transform conventions (revised 2026-05-28):
 *   [pause]       → " — "   (em-dash with spaces)
 *   [long pause]  → ' <break time="2.5s" /> '  (real SSML break)
 *   [softly] etc. → dropped (the voice settings already carry the tone)
 *
 * Why em-dash for [pause]? Per ElevenLabs practitioner consensus, the
 * em-dash is the most reliable pause signal — more consistent than the
 * previous ", …" substitution (which produced malformed punctuation
 * after sentence-ending periods, like ". , …") and avoids the
 * "hesitation/nervousness" tone that ellipsis can introduce. The
 * regex also eats preceding punctuation (". [pause]" → " — ") so two
 * short staccato sentences get merged into one flowing clause, which
 * relaxes the model's natural fast-read cadence on short fragments.
 *
 * Why <break> only for [long pause]? Excessive break tags cause an
 * ElevenLabs speed-up artifact (documented). Reserving break tags
 * for the rare deliberate long beats keeps us well under the threshold.
 */
export function stripMeditationMarkers(text: string): string {
  return text
    // [long pause] FIRST — eat any preceding sentence punctuation +
    // whitespace, replace with a real 2.5-second break tag.
    .replace(/(?:[.,;:]\s*)?\[long\s+pause[^\]]*\]/gi, ' <break time="2.5s" />')
    // [pause] / [pause for a moment] / etc. — eat preceding punctuation
    // so ". [pause] Next" becomes " — Next" (merges the period+pause
    // into a single em-dash break, which v2 reads as a definite,
    // flowing pause rather than two staccato sentences with a clipped
    // gap between them).
    .replace(/(?:[.,;:]\s*)?\[pause[^\]]*\]/gi, ' — ')
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
        // Tuned for bedtime narration (revised 2026-05-28):
        //   stability:0.70  — practitioner consensus for long-form
        //                     narration is 0.6–0.8. Our previous 0.95
        //                     over-stabilized: it damped the *good*
        //                     prosodic variation (natural slow-downs,
        //                     breaths) and left a flatter, mechanically
        //                     paced delivery. 0.70 restores the breath.
        //   speed:0.85      — bumped up from the previous 0.80 floor.
        //                     If stability:0.70 + em-dash transform
        //                     fix the within-paragraph cadence, we
        //                     don't need the aggressive speed cut
        //                     (which approaches "stretched artifact"
        //                     territory near 0.80).
        //   style:0.0       — no conversational lift; flat editorial
        //                     read.
        //   similarity_boost:0.75 + use_speaker_boost:true — defaults.
        voice_settings: {
          stability: 0.70,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
          speed: 0.85,
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

  const { title, style, voice, id: rawId, script: scriptPath, description } = parseArgs();
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
  const raw = await callElevenLabs(elevenLabsKey, voiceId, script);

  // 4. Loudness-normalize. ElevenLabs output varies meaningfully between
  // voices and scripts — body-scan was measured ~12 dB louder than
  // seaside-village pre-fix. -19 LUFS sits at audiobook standard so the
  // voice reads present against the rest of the app without punching
  // through at 2am. See tools/normalize-voice-audio.ts for the rationale.
  console.log('  ⟳  Normalizing loudness (-19 LUFS)…');
  const audioData = normalizeVoiceMp3(raw);
  console.log(`  ✓  Normalized (${(audioData.byteLength / 1024 / 1024).toFixed(1)} MB)`);

  // 5. Save MP3
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
    description: existing?.description ?? (description || `A ${style.replace('-', ' ')} meditation.`),
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
