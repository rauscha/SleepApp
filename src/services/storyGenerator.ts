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
// Voice IDs: custom voices designed in the ElevenLabs Voice Design
// portal. Stories use Tide (female) and Stone (male); meditations use
// Hush, Ember, and Glen.
//
// Long-form path: sleep stories run 2800–3200 words (~17–20K chars),
// which is well past the standard TTS endpoint's 5K-char per-request
// limit. Two strategies handle the overflow:
//
//   - Projects API (preferred on Creator plan and up): one project
//     holds the whole script, ElevenLabs chunks internally, returns a
//     single audio file. Gated by VITE_ELEVENLABS_USE_PROJECTS.
//   - Chunked TTS fallback: paragraph-boundary split → per-chunk
//     standard TTS → MP3 byte-concat in the browser. Used when the
//     Projects flag is off OR when the Projects call fails for any
//     reason (e.g. plan downgrade, API outage).
//
// Why MP3 byte-concat works in the browser: MP3 frames are self-
// contained, the decoder resyncs on frame headers, and Howler (our
// playback path) tolerates concatenated streams. Fancy concat (ffmpeg)
// would need ffmpeg.wasm — heavy, slow, and unnecessary for the seam
// quality we need on a sleep story where the listener is drifting off.

import { saveStory, saveStoryAudio } from '../storage';
import type { StoryMetadata } from '../storage/types';

// ---------------------------------------------------------------------------
// Voice map

export const STORY_VOICE_IDS: Record<string, string> = {
  tide:  import.meta.env.VITE_VOICE_TIDE,  // soft female narrator
  stone: import.meta.env.VITE_VOICE_STONE, // male narrator
};

export const MEDITATION_VOICE_IDS: Record<string, string> = {
  hush:  import.meta.env.VITE_VOICE_HUSH,  // soft female
  ember: import.meta.env.VITE_VOICE_EMBER, // warm female
  glen:  import.meta.env.VITE_VOICE_GLEN,  // male
};

// ---------------------------------------------------------------------------
// Constants

/** Per-request character limit for ElevenLabs standard TTS. The public
 *  limit is 5000; we hold a 500-char buffer for the trailing prosody
 *  context tokens ElevenLabs prepends server-side. */
export const TTS_CHUNK_LIMIT = 4500;

/** Poll cadence and ceiling for Projects conversion. A 3K-word story
 *  typically converts in 60–180 s; we cap at 20 min so a stuck job
 *  surfaces as a clear error instead of hanging the UI forever. */
export const PROJECT_POLL_INTERVAL_MS = 5_000;
export const PROJECT_POLL_MAX_MS = 20 * 60 * 1000;

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

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
  voiceName: 'tide' | 'stone';
  anthropicApiKey: string;
  elevenLabsApiKey: string;
  /** Bed scene id to pair with this story. Played underneath narration
   *  and left running afterwards so the room stays filled all night.
   *  Null is allowed for back-compat / no bed. */
  sceneId?: string | null;
  onProgress?: (step: GenerationStep) => void;
  /** Pass an AbortSignal to allow the user (or unmount) to cancel
   *  mid-flight. fetch() rejects with an AbortError when aborted; the
   *  caller can recognize it via error.name === 'AbortError'. */
  signal?: AbortSignal;
  /** Override the Projects flag at call time (tests). Falls back to
   *  the build-time `VITE_ELEVENLABS_USE_PROJECTS` env var. */
  useProjects?: boolean;
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
  sceneId?: string | null;
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
    sceneId: args.sceneId ?? null,
  };
}

/** Split a script into chunks that each fit under `maxChars`.
 *
 *  Strategy: prefer paragraph boundaries (`\n\n`). If a single paragraph
 *  is too long, fall back to sentence boundaries within it. If a single
 *  sentence is still too long (rare for sleep stories), hard-split at
 *  `maxChars`. The split never falls mid-word unless the input itself
 *  has a single word longer than the limit.
 *
 *  Empty/short inputs return a single-element array so callers can treat
 *  the chunked path uniformly. */
export function chunkScript(text: string, maxChars = TTS_CHUNK_LIMIT): string[] {
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
      // This paragraph alone exceeds the limit — flush whatever we have,
      // then split it at sentence boundaries.
      flush();
      for (const sent of splitSentences(para, maxChars)) {
        if (current.length + sent.length + 1 > maxChars) flush();
        current = current ? current + ' ' + sent : sent;
      }
      continue;
    }
    if (current.length + para.length + 2 > maxChars) flush();
    current = current ? current + '\n\n' + para : para;
  }
  flush();
  return chunks;
}

/** Split a paragraph at sentence terminators. Anything still over the
 *  limit gets hard-split at `maxChars`. */
function splitSentences(para: string, maxChars: number): string[] {
  const out: string[] = [];
  // Split on sentence enders but keep the terminator attached.
  const sentences = para.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [para];
  for (const s of sentences) {
    if (s.length <= maxChars) {
      out.push(s.trim());
    } else {
      for (let i = 0; i < s.length; i += maxChars) {
        out.push(s.slice(i, i + maxChars).trim());
      }
    }
  }
  return out.filter(Boolean);
}

/** Concatenate ArrayBuffers into one. Used to stitch chunked MP3
 *  responses; MP3 frames resync at frame headers, so byte-concat
 *  produces a stream that browser audio decoders play through
 *  cleanly. */
export function concatArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out.buffer;
}

/** Decide whether a script needs the long-form path. Used by the
 *  dispatcher and surfaced for tests. */
export function isLongForm(text: string, threshold = TTS_CHUNK_LIMIT): boolean {
  return text.length > threshold;
}

/** Read the Projects feature flag, defaulting to true (Creator plan
 *  baseline). The env var is a string ('true'/'false') because Vite
 *  inlines `import.meta.env.*` values as strings at build time. */
export function isProjectsEnabled(): boolean {
  const raw = (import.meta.env.VITE_ELEVENLABS_USE_PROJECTS ?? 'true').toString();
  return raw.toLowerCase() !== 'false';
}

// ---------------------------------------------------------------------------
// Entry point

export async function generateStory(
  opts: GenerateStoryOptions
): Promise<StoryMetadata> {
  const {
    theme,
    voiceName,
    anthropicApiKey,
    elevenLabsApiKey,
    sceneId,
    onProgress,
    signal,
    useProjects,
  } = opts;

  // --- Step 1: Write the script with Claude ---
  onProgress?.({ stage: 'writing', message: 'Writing script with Claude…' });
  const script = await callClaude(anthropicApiKey, theme, signal);

  // --- Step 2: Synthesize audio with ElevenLabs ---
  onProgress?.({
    stage: 'synthesizing',
    message: 'Synthesizing audio with ElevenLabs…',
  });
  const voiceId = STORY_VOICE_IDS[voiceName] ?? STORY_VOICE_IDS['tide']!;
  const projectsFlag = useProjects ?? isProjectsEnabled();
  const audioBuffer = await synthesizeStoryAudio({
    apiKey: elevenLabsApiKey,
    voiceId,
    text: script,
    signal,
    useProjects: projectsFlag,
    onProgress,
  });

  // --- Step 3: Save ---
  onProgress?.({ stage: 'saving', message: 'Saving…' });
  const meta = buildStoryMetadata({
    id: makeStoryId(),
    theme,
    voiceName,
    script,
    sceneId: sceneId ?? null,
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
// Audio synthesis dispatcher

interface SynthesizeArgs {
  apiKey: string;
  voiceId: string;
  text: string;
  signal?: AbortSignal;
  useProjects: boolean;
  onProgress?: (step: GenerationStep) => void;
  /** Override Projects poll interval (ms). Tests use a small value. */
  projectsPollIntervalMs?: number;
  projectsPollMaxMs?: number;
}

/** Pick the right ElevenLabs path based on script length and the
 *  Projects flag. Short scripts always use the standard TTS endpoint
 *  (fastest, cheapest). Long scripts try Projects first when enabled,
 *  then fall back to chunked TTS if Projects errors. */
export async function synthesizeStoryAudio(
  args: SynthesizeArgs
): Promise<ArrayBuffer> {
  const {
    apiKey,
    voiceId,
    text,
    signal,
    useProjects,
    onProgress,
    projectsPollIntervalMs,
    projectsPollMaxMs,
  } = args;

  // Strip Claude's stage-direction markers before *any* TTS path. The
  // prompt asks Claude to insert [pause] / [softly] etc. for prosody
  // guidance; the chunked /text-to-speech endpoint reads brackets aloud
  // verbatim, and even the Projects API (which absorbs the markers)
  // produces less reliable pauses than our em-dash substitution. Mirror
  // of tools/gen-story.ts:stripStoryMarkers — keep in sync.
  const cleaned = stripStoryMarkers(text);

  if (!isLongForm(cleaned)) {
    return callElevenLabs(apiKey, voiceId, cleaned, signal);
  }

  if (useProjects) {
    try {
      onProgress?.({
        stage: 'synthesizing',
        message: 'Long script — using ElevenLabs Projects…',
      });
      return await callElevenLabsProjects(
        apiKey,
        voiceId,
        cleaned,
        signal,
        onProgress,
        projectsPollIntervalMs,
        projectsPollMaxMs
      );
    } catch (err) {
      // Abort propagates as-is — the user pressed Cancel.
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      console.warn('Projects API failed, falling back to chunked TTS:', err);
      onProgress?.({
        stage: 'synthesizing',
        message: 'Projects API unavailable — falling back to chunked TTS…',
      });
    }
  }

  return callElevenLabsChunked(apiKey, voiceId, cleaned, signal, onProgress);
}

/**
 * Strip Claude's stage-direction markers before TTS. See the matching
 * implementation in tools/gen-story.ts for the full rationale — em-dash
 * is the most reliable pause mechanism per ElevenLabs practitioner
 * consensus, more so than ellipsis (which adds hesitation/nervousness
 * tone).
 */
export function stripStoryMarkers(text: string): string {
  return text
    .replace(/(?:[.,;:]\s*)?\[long\s+pause[^\]]*\]/gi, ' <break time="2.5s" />')
    .replace(/(?:[.,;:]\s*)?\[pause[^\]]*\]/gi, ' — ')
    .replace(/\[(?:softly|whisper(?:ing)?|gently|quietly|slowly)\]/gi, '')
    .replace(/\[[^\]]{1,40}\]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ,/g, ',')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
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
    `${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}`,
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
        // Voice settings revised 2026-05-28. Mirrors tools/gen-story.ts.
        //   stability:0.70 — practitioner consensus for long-form
        //                    narration (0.6–0.8). Higher values
        //                    over-stabilize and damp the natural
        //                    breath/slow-down prosody.
        //   speed:0.85     — modest slow-down. Floor is 0.7; below
        //                    ~0.80 introduces stretched artifacts.
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

/** Chunked-TTS path. Splits the script at paragraph boundaries, runs
 *  each piece through the standard TTS endpoint sequentially, and byte-
 *  concatenates the MP3 chunks. Sequential rather than parallel because
 *  ElevenLabs throttles concurrent requests on the Creator plan, and the
 *  user pays per character either way. */
export async function callElevenLabsChunked(
  apiKey: string,
  voiceId: string,
  text: string,
  signal?: AbortSignal,
  onProgress?: (step: GenerationStep) => void
): Promise<ArrayBuffer> {
  const chunks = chunkScript(text);
  if (chunks.length === 0) throw new Error('Empty script — nothing to synthesize.');

  const buffers: ArrayBuffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({
      stage: 'synthesizing',
      message: `Synthesizing chunk ${i + 1} of ${chunks.length}…`,
    });
    const buf = await callElevenLabs(apiKey, voiceId, chunks[i]!, signal);
    buffers.push(buf);
  }
  return concatArrayBuffers(buffers);
}

/** Projects API flow:
 *    1. POST /v1/projects                — create the project
 *    2. POST /v1/projects/{id}/content   — attach the script
 *    3. POST /v1/projects/{id}/convert   — trigger TTS conversion
 *    4. GET  /v1/projects/{id}           — poll until status === "converted"
 *    5. GET  /v1/projects/{id}/chapters/{chapter_id}/audio  — download
 *
 *  Step 2 may be folded into step 1 by ElevenLabs depending on the
 *  current API shape (the create response sometimes includes a default
 *  chapter already containing the content). We attempt the explicit
 *  content call and ignore a 4xx that indicates the content is already
 *  present, so the flow tolerates both shapes. */
export async function callElevenLabsProjects(
  apiKey: string,
  voiceId: string,
  text: string,
  signal?: AbortSignal,
  onProgress?: (step: GenerationStep) => void,
  pollIntervalMs: number = PROJECT_POLL_INTERVAL_MS,
  pollMaxMs: number = PROJECT_POLL_MAX_MS
): Promise<ArrayBuffer> {
  const headers = {
    'content-type': 'application/json',
    'xi-api-key': apiKey,
  };

  // --- 1. Create project ---
  onProgress?.({ stage: 'synthesizing', message: 'Creating Projects job…' });
  const createRes = await fetch(`${ELEVENLABS_BASE}/v1/projects`, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({
      name: `sleep-story-${Date.now()}`,
      default_title_voice_id: voiceId,
      default_paragraph_voice_id: voiceId,
      default_model_id: 'eleven_multilingual_v2',
      content: text,
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    throw new Error(
      `ElevenLabs Projects create failed ${createRes.status}: ${body.slice(0, 200)}`
    );
  }
  const created = (await createRes.json()) as {
    project_id?: string;
    project?: { project_id: string };
    chapter_id?: string;
    chapters?: Array<{ chapter_id: string }>;
  };
  const projectId = created.project_id ?? created.project?.project_id;
  if (!projectId) throw new Error('ElevenLabs Projects: no project_id in create response.');

  // --- 2. Add content (idempotent: skip if create already attached it) ---
  if (!created.chapter_id && !created.chapters?.length) {
    const contentRes = await fetch(
      `${ELEVENLABS_BASE}/v1/projects/${projectId}/content`,
      {
        method: 'POST',
        signal,
        headers,
        body: JSON.stringify({ content: text }),
      }
    );
    // A 4xx here usually means the content was already attached at
    // create-time; treat it as non-fatal.
    if (!contentRes.ok && contentRes.status >= 500) {
      const body = await contentRes.text().catch(() => '');
      throw new Error(
        `ElevenLabs Projects content failed ${contentRes.status}: ${body.slice(0, 200)}`
      );
    }
  }

  // --- 3. Trigger conversion ---
  onProgress?.({ stage: 'synthesizing', message: 'Converting (1–3 min)…' });
  const convertRes = await fetch(
    `${ELEVENLABS_BASE}/v1/projects/${projectId}/convert`,
    { method: 'POST', signal, headers }
  );
  if (!convertRes.ok) {
    const body = await convertRes.text().catch(() => '');
    throw new Error(
      `ElevenLabs Projects convert failed ${convertRes.status}: ${body.slice(0, 200)}`
    );
  }

  // --- 4. Poll until converted ---
  const chapterId = await pollProjectUntilConverted(
    apiKey,
    projectId,
    signal,
    pollIntervalMs,
    pollMaxMs
  );

  // --- 5. Download audio ---
  onProgress?.({ stage: 'synthesizing', message: 'Downloading audio…' });
  const audioRes = await fetch(
    `${ELEVENLABS_BASE}/v1/projects/${projectId}/chapters/${chapterId}/audio`,
    {
      method: 'GET',
      signal,
      headers: { 'xi-api-key': apiKey },
    }
  );
  if (!audioRes.ok) {
    const body = await audioRes.text().catch(() => '');
    throw new Error(
      `ElevenLabs Projects audio download failed ${audioRes.status}: ${body.slice(0, 200)}`
    );
  }
  return audioRes.arrayBuffer();
}

async function pollProjectUntilConverted(
  apiKey: string,
  projectId: string,
  signal?: AbortSignal,
  intervalMs: number = PROJECT_POLL_INTERVAL_MS,
  maxMs: number = PROJECT_POLL_MAX_MS
): Promise<string> {
  const started = Date.now();
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() - started > maxMs) {
      throw new Error(
        `ElevenLabs Projects: conversion still pending after ${maxMs / 1000}s.`
      );
    }

    const res = await fetch(`${ELEVENLABS_BASE}/v1/projects/${projectId}`, {
      method: 'GET',
      signal,
      headers: { 'xi-api-key': apiKey },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `ElevenLabs Projects status check failed ${res.status}: ${body.slice(0, 200)}`
      );
    }
    const data = (await res.json()) as {
      status?: string;
      project?: { status?: string };
      chapters?: Array<{ chapter_id: string; state?: string }>;
      chapter_id?: string;
    };
    const status = data.status ?? data.project?.status ?? '';
    if (status === 'converted' || status === 'done') {
      const chapterId =
        data.chapter_id ??
        data.chapters?.[0]?.chapter_id;
      if (!chapterId) {
        throw new Error('ElevenLabs Projects: converted but no chapter_id in response.');
      }
      return chapterId;
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`ElevenLabs Projects: conversion reported status "${status}".`);
    }

    await sleep(intervalMs, signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
