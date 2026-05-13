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
}

export type GenerationStep =
  | { stage: 'writing'; message: string }
  | { stage: 'synthesizing'; message: string }
  | { stage: 'saving'; message: string }
  | { stage: 'done'; storyId: string };

// ---------------------------------------------------------------------------
// Entry point

export async function generateStory(
  opts: GenerateStoryOptions
): Promise<StoryMetadata> {
  const { theme, voiceName, anthropicApiKey, elevenLabsApiKey, onProgress } =
    opts;

  // --- Step 1: Write the script with Claude ---
  onProgress?.({ stage: 'writing', message: 'Writing script with Claude…' });
  const script = await callClaude(anthropicApiKey, theme);

  // --- Step 2: Synthesize audio with ElevenLabs ---
  onProgress?.({
    stage: 'synthesizing',
    message: 'Synthesizing audio with ElevenLabs…',
  });
  const voiceId = STORY_VOICE_IDS[voiceName] ?? STORY_VOICE_IDS['hush']!;
  const audioBuffer = await callElevenLabs(elevenLabsApiKey, voiceId, script);

  // --- Step 3: Save ---
  onProgress?.({ stage: 'saving', message: 'Saving…' });
  const id = `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const wordCount = script.trim().split(/\s+/).length;
  // ~130 wpm average narration pace for a slow, deliberate reader
  const durationSeconds = Math.round((wordCount / 130) * 60);

  const titleMatch = /^(.{20,80}?)[.!?]/.exec(script.replace(/\[.*?\]/g, ''));
  const title = titleMatch
    ? titleMatch[1].trim()
    : theme.slice(0, 40).trim();

  const meta: StoryMetadata = {
    id,
    title,
    theme,
    voiceId: voiceName,
    createdAt: new Date().toISOString(),
    durationSeconds,
    script,
    sceneId: null,
  };

  await saveStory(meta);
  await saveStoryAudio({
    id,
    mimeType: 'audio/mpeg',
    data: audioBuffer,
    savedAt: new Date().toISOString(),
  });

  onProgress?.({ stage: 'done', storyId: id });
  return meta;
}

// ---------------------------------------------------------------------------
// API helpers

async function callClaude(apiKey: string, theme: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
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
  text: string
): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
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
    throw new Error(
      `ElevenLabs API error ${res.status}: ${body.slice(0, 200)}`
    );
  }

  return res.arrayBuffer();
}
