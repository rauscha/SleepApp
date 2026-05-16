// Story generation pipeline.
//
// Steps:
//   1. Call the Anthropic API (Claude) to write the script.
//   2. Call the ElevenLabs API to synthesize the audio.
//   3. Save metadata to localStorage + audio bytes to IndexedDB.
//
// Both API calls go direct from the browser using the user's own keys
// stored in localStorage. The Anthropic call requires the non-standard
// `anthropic-dangerous-direct-browser-access: true` header (Anthropic's
// own mechanism for acknowledging browser key exposure in personal apps).
//
// Voice IDs: the map below uses ElevenLabs premade voices as stand-ins.
// Replace with custom voice IDs once the Voice Design workflow is run.

import { saveStory, saveStoryAudio } from '../storage';
import type { StoryMetadata } from '../storage/types';

// ---------------------------------------------------------------------------
// Voice map

/** Premade ElevenLabs voice IDs for each named voice. Update when custom
 *  voices are created in the ElevenLabs Voice Design portal. */
export const STORY_VOICE_IDS: Record<string, string> = {
  hush:  'EXAVITQu4vr4xnSDxMaL', // Bella   — soft female
  ember: '21m00Tcm4TlvDq8ikWAM', // Rachel  — warm storytelling female
  glen:  'TxGEqnHWrfWFTfGW9XjX', // Josh    — deep resonant male
};

export const MEDITATION_VOICE_IDS: Record<string, string> = {
  tide:  'MF3mGyEYCl7XYWbV9V6O', // Elli    — soft female
  stone: 'pNInz6obpgDQGcFmaJgB', // Adam    — calm neutral male
};

// ---------------------------------------------------------------------------
// Prompts

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

// ---------------------------------------------------------------------------
// Types

export interface GenerateStoryOptions {
  theme: string;
  voiceName: 'hush' | 'ember' | 'glen';
  anthropicApiKey: string;
  elevenLabsApiKey: string;
  onProgress?: (step: GenerationStep) => void;
  /** Pass an AbortSignal to allow the user (or unmount) to cancel
   *  mid-flight. fetch() rejects with an AbortError when aborted; the
   *  caller can recognize it via error.name === 'AbortError'. */
  signal?: AbortSignal;
}

export type GenerationStep =
  | { stage: 'writing'; message: string }
  | { stage: 'synthesizing'; message: string }
  | { stage: 'saving'; message: string }
  | { stage: 'done'; storyId: string };

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)

/** Count words in a string. Returns 0 for empty/whitespace input. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Estimate spoken duration in seconds at the given words-per-minute pace.
 *  130 wpm matches a slow, deliberate sleep-story narration. */
export function estimateDurationSeconds(script: string, wpm = 130): number {
  const words = countWords(script);
  if (words === 0) return 0;
  return Math.round((words / wpm) * 60);
}

/** Derive a human-readable title from the user's theme. Falls back to a
 *  generic label if the theme is empty or whitespace.
 *
 *  Why theme-based instead of script-derived: the previous heuristic
 *  (regex over the first sentence) silently failed when the opening
 *  sentence was longer than 80 chars or shorter than 20, producing
 *  partial-theme titles. The theme is already a tight summary the user
 *  wrote — capitalize it and use it directly. */
export function deriveTitle(theme: string): string {
  const trimmed = theme.trim();
  if (!trimmed) return 'Sleep story';
  const cased = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  // Soft truncate at 60 chars to keep titles single-line in the Library
  // list. Break at the last word boundary before the limit when possible.
  if (cased.length <= 60) return cased;
  const cut = cased.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

/** Build a unique story id. Pass `now` and `rand` for deterministic tests. */
export function makeStoryId(now = Date.now(), rand = Math.random()): string {
  const suffix = rand.toString(36).slice(2, 8).padEnd(6, '0');
  return `story-${now}-${suffix}`;
}

/** Build the StoryMetadata object that will be persisted. Pulled out so
 *  tests can verify shape without running the full generation pipeline. */
export function buildStoryMetadata(args: {
  id: string;
  theme: string;
  voiceName: string;
  script: string;
  createdAt?: string;
}): StoryMetadata {
  return {
    id: args.id,
    title: deriveTitle(args.theme),
    theme: args.theme,
    voiceId: args.voiceName,
    createdAt: args.createdAt ?? new Date().toISOString(),
    durationSeconds: estimateDurationSeconds(args.script),
    script: args.script,
    sceneId: null,
  };
}

// ---------------------------------------------------------------------------
// Entry point

export async function generateStory(
  opts: GenerateStoryOptions
): Promise<StoryMetadata> {
  const { theme, voiceName, anthropicApiKey, elevenLabsApiKey, onProgress, signal } =
    opts;

  // --- Step 1: Write the script with Claude ---
  onProgress?.({ stage: 'writing', message: 'Writing script with Claude…' });
  const script = await callClaude(anthropicApiKey, theme, signal);

  // --- Step 2: Synthesize audio with ElevenLabs ---
  onProgress?.({
    stage: 'synthesizing',
    message: 'Synthesizing audio with ElevenLabs…',
  });
  const voiceId = STORY_VOICE_IDS[voiceName] ?? STORY_VOICE_IDS['hush']!;
  const audioBuffer = await callElevenLabs(elevenLabsApiKey, voiceId, script, signal);

  // --- Step 3: Save ---
  onProgress?.({ stage: 'saving', message: 'Saving…' });
  const meta = buildStoryMetadata({
    id: makeStoryId(),
    theme,
    voiceName,
    script,
  });

  await saveStory(meta);
  await saveStoryAudio({
    id: meta.id,
    mimeType: 'audio/mpeg',
    data: audioBuffer,
    savedAt: new Date().toISOString(),
  });

  onProgress?.({ stage: 'done', storyId: meta.id });
  return meta;
}

// ---------------------------------------------------------------------------
// API helpers

async function callClaude(
  apiKey: string,
  theme: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Anthropic's explicit mechanism for browser key exposure in personal apps.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: STORY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Write a sleep story. Theme: ${theme}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content.find((b) => b.type === 'text')?.text ?? '';
  if (!text) throw new Error('Claude returned an empty response.');
  return text;
}

async function callElevenLabs(
  apiKey: string,
  voiceId: string,
  text: string,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // The user just spent 30s+ and a few cents of Claude credits to get
    // this script — log it so they can copy it from devtools and retry
    // synthesis manually instead of paying for regeneration. Also fold
    // the script length into the error itself: 422 from this endpoint
    // is almost always a per-request character-limit hit, and the limit
    // depends on the user's ElevenLabs plan tier — seeing the actual
    // length lets them know whether to upgrade or shorten the prompt.
    console.error('ElevenLabs synth failed — preserving script:', text);
    throw new Error(
      `ElevenLabs API error ${res.status} (script ${text.length} chars): ${body.slice(0, 200)}`
    );
  }

  return res.arrayBuffer();
}
