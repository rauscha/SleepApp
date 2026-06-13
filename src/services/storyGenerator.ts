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

import { deleteStory, saveStory, saveStoryAudio } from '../storage';
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

/** Per-request fetch timeout. Generation calls (Claude completion,
 *  ElevenLabs TTS, Projects control + poll) normally settle in well under
 *  a minute; 150s leaves headroom while guaranteeing that a request the OS
 *  half-killed — what happens when a phone screen sleeps mid-generation and
 *  suspends the tab — surfaces as a recoverable TimeoutError instead of
 *  leaving the UI stuck on "Writing script with Claude…" forever. */
export const FETCH_TIMEOUT_MS = 150_000;

/** Longer ceiling for the Projects audio download specifically: a full
 *  ~20-min story MP3 can be 15–20 MB, which legitimately takes minutes on a
 *  weak mobile connection — don't false-timeout a download still making
 *  progress. */
export const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

/** ElevenLabs output_format for the chunked TTS path.
 *
 *  Requesting raw PCM instead of MP3 lets us do per-chunk RMS normalization
 *  using only arithmetic — no decode/re-encode library required in the browser.
 *  22050 Hz mono is more than adequate for voice (Nyquist at 11025 Hz covers
 *  all intelligibility bands and ElevenLabs' actual voice bandwidth).
 *
 *  Storage overhead vs MP3: ~3× larger files (WAV is uncompressed). For a
 *  personal library of a handful of generated stories in IndexedDB this is
 *  acceptable — a 17-min story is ~45 MB vs ~15 MB for MP3.
 *
 *  Why this matters: without per-chunk normalization the raw byte-concat of
 *  multiple TTS calls can have 10+ dB level jumps at paragraph seams — enough
 *  to startle a listener awake. The CLI tool (gen-story.ts) avoids this by
 *  running ffmpeg loudnorm on the finished file; the browser has no ffmpeg, so
 *  PCM + RMS normalization is the equivalent. */
export const CHUNK_OUTPUT_FORMAT = 'pcm_22050';
export const CHUNK_SAMPLE_RATE = 22050;

/** Target RMS (as fraction of Int16 full-scale) for per-chunk normalization.
 *  0.08 ≈ −22 dBFS RMS — comfortable narration level. Loud chunks are pulled
 *  down; quiet chunks are brought up (subject to MAX_CHUNK_GAIN). */
export const NORM_TARGET_RMS = 0.08;

/** Maximum linear gain applied to a quiet chunk.
 *  4.0 ≈ +12 dB — high enough to raise soft drift sections without amplifying
 *  noise floor from mostly-silent pause chunks into audible hiss. */
export const NORM_MAX_GAIN = 4.0;

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

Output in this exact format — title tag first, story immediately after, nothing else:
<title>2–5 word evocative title, title case</title>
[story text, no blank line after the tag, no preamble, no quotation marks]`;

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
 *  tests can verify shape without running the full generation pipeline.
 *
 *  Pass `title` to use a caller-provided title (e.g. one returned by
 *  Claude); omit it to fall back to `deriveTitle(theme)`. */
export function buildStoryMetadata(args: {
  id: string;
  theme: string;
  voiceName: string;
  script: string;
  sceneId?: string | null;
  createdAt?: string;
  /** Optional explicit title. Overrides the deriveTitle(theme) fallback. */
  title?: string;
}): StoryMetadata {
  return {
    id: args.id,
    title: args.title ?? deriveTitle(args.theme),
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

/** Return type for synthesizeStoryAudio.
 *  Chunked TTS produces WAV (PCM + RIFF header, normalized).
 *  Projects / short-script paths produce MP3 (single ElevenLabs file). */
export interface SynthesizedAudio {
  data: ArrayBuffer;
  mimeType: 'audio/mpeg' | 'audio/wav';
}

// ---------------------------------------------------------------------------
// PCM normalization helpers (chunked TTS path)

/** Build a minimal 44-byte RIFF/WAV header for mono 16-bit PCM.
 *  Prepend this to raw Int16 sample bytes to produce a valid .wav file. */
export function buildWavHeader(numSamples: number, sampleRate: number): ArrayBuffer {
  const byteRate = sampleRate * 2; // mono, 16-bit = 2 bytes/sample
  const dataSize = numSamples * 2;
  const buf = new ArrayBuffer(44);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  const w = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) u8[offset + i] = s.charCodeAt(i);
  };

  w(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);   // file size - 8
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);             // PCM fmt chunk size
  view.setUint16(20, 1, true);              // audio format: PCM
  view.setUint16(22, 1, true);              // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true);              // block align
  view.setUint16(34, 16, true);             // bits per sample
  w(36, 'data');
  view.setUint32(40, dataSize, true);

  return buf;
}

/** Compute RMS of a 16-bit PCM chunk, normalized to [0, 1] range.
 *  Returns 0 for an empty array. */
export function computeRms(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = (samples[i] as number) / 32768;
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples.length);
}

/** Per-chunk RMS normalization — the browser-side equivalent of ffmpeg loudnorm.
 *
 *  Each ElevenLabs TTS chunk can be rendered at a wildly different level.
 *  Byte-concatenating raw chunks produces sudden 10+ dB jumps at paragraph
 *  seams. This function:
 *   1. Computes the RMS of each chunk.
 *   2. Sets a target RMS = median of the voiced-chunk RMSes (median is robust
 *      against one outlier paragraph skewing the target).
 *   3. Applies a per-chunk gain = min(targetRms / chunkRms, maxGain) so every
 *      chunk lands near the same loudness level.
 *   4. Clamps samples to Int16 range after scaling.
 *   5. Does a final peak-safety pass: if any sample exceeds 0.95 × full scale,
 *      scales the whole buffer down to prevent clipping.
 *   6. Returns the normalized samples concatenated into one Int16Array.
 *
 *  Chunks with RMS < 0.001 are treated as silence and left at unity gain to
 *  avoid amplifying a near-zero noise floor into audible hiss. */
export function normalizePcmChunks(
  chunks: Int16Array[],
  targetRmsFraction = NORM_TARGET_RMS,
  maxGain = NORM_MAX_GAIN
): Int16Array {
  if (chunks.length === 0) return new Int16Array(0);

  const SILENCE_THRESHOLD = 0.001;

  // Step 1: RMS per chunk
  const rmsValues = chunks.map(computeRms);

  // Step 2: median of voiced chunks
  const voiced = rmsValues.filter((r) => r > SILENCE_THRESHOLD).sort((a, b) => a - b);
  let targetRms: number;
  if (voiced.length === 0) {
    // All silence — just concatenate as-is
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Int16Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }
  const mid = Math.floor(voiced.length / 2);
  targetRms =
    voiced.length % 2 === 0
      ? ((voiced[mid - 1] as number) + (voiced[mid] as number)) / 2
      : (voiced[mid] as number);
  // Cap the target at the caller-supplied fraction so we don't amplify
  // an already-correct quiet narration up toward an arbitrary ceiling.
  targetRms = Math.min(targetRms, targetRmsFraction);

  // Step 3: per-chunk gain
  const gains = rmsValues.map((rms) => {
    if (rms < SILENCE_THRESHOLD) return 1.0;
    return Math.min(targetRms / rms, maxGain);
  });

  // Steps 4 & 5: apply gain, clamp, concatenate
  const totalSamples = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Int16Array(totalSamples);
  let offset = 0;
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci] as Int16Array;
    const gain = gains[ci] as number;
    for (let i = 0; i < chunk.length; i++) {
      const scaled = Math.round((chunk[i] as number) * gain);
      out[offset + i] = Math.max(-32768, Math.min(32767, scaled));
    }
    offset += chunk.length;
  }

  // Step 6: peak-safety pass (avoid clipping)
  let maxAbs = 0;
  for (let i = 0; i < out.length; i++) {
    const abs = Math.abs(out[i] as number);
    if (abs > maxAbs) maxAbs = abs;
  }
  const PEAK_CEILING = 31130; // ≈ 0.95 × 32767
  if (maxAbs > PEAK_CEILING) {
    const safeGain = PEAK_CEILING / maxAbs;
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.round((out[i] as number) * safeGain);
    }
  }

  return out;
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
  const { title: claudeTitle, script } = await callClaude(anthropicApiKey, theme, signal);

  // --- Step 2: Synthesize audio with ElevenLabs ---
  // In-world progress copy (roadmap 6.6): the listener-facing wait reads as
  // the narrator reading the story, not a chunked TTS job.
  const voiceLabel = voiceName.charAt(0).toUpperCase() + voiceName.slice(1);
  onProgress?.({
    stage: 'synthesizing',
    message: `${voiceLabel} is reading your story…`,
  });
  const voiceId = STORY_VOICE_IDS[voiceName] ?? STORY_VOICE_IDS['tide']!;
  const projectsFlag = useProjects ?? isProjectsEnabled();
  const { data: audioBuffer, mimeType: audioMimeType } = await synthesizeStoryAudio({
    apiKey: elevenLabsApiKey,
    voiceId,
    voiceLabel,
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
    // Use Claude's title if it returned one; fall back to deriveTitle(theme)
    // so the behaviour is unchanged if the tag is absent.
    title: claudeTitle || undefined,
  });

  // Metadata and audio commit in separate IndexedDB transactions. Persist
  // metadata first, then the audio bytes — and if the audio write fails
  // (most likely a QuotaExceededError on a ~45 MB WAV), delete the
  // just-written metadata so the Library never lists a story whose audio
  // never landed (review bug H2). withStore now resolves on transaction
  // commit, so a quota abort surfaces here as a rejection rather than a
  // false 'done'.
  await saveStory(meta);
  try {
    await saveStoryAudio({
      id: meta.id,
      mimeType: audioMimeType,
      data: audioBuffer,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Roll back the orphaned metadata row. A cleanup failure is swallowed —
    // the audio-save error is what the caller needs to see.
    await deleteStory(meta.id).catch(() => undefined);
    throw err;
  }

  onProgress?.({ stage: 'done', storyId: meta.id });
  return meta;
}

// ---------------------------------------------------------------------------
// Audio synthesis dispatcher

interface SynthesizeArgs {
  apiKey: string;
  voiceId: string;
  /** Display name of the narrator for in-world progress copy (6.6). */
  voiceLabel?: string;
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
 *  then fall back to chunked TTS if Projects errors.
 *
 *  Return value includes the MIME type because the two paths produce
 *  different formats:
 *   - Projects / short-script → 'audio/mpeg'  (single ElevenLabs MP3)
 *   - Chunked TTS             → 'audio/wav'   (PCM normalized + RIFF header)
 *
 *  The caller stores the mimeType alongside the audio in IndexedDB so
 *  LibraryScreen can create the correct Blob for playback. */
export async function synthesizeStoryAudio(
  args: SynthesizeArgs
): Promise<SynthesizedAudio> {
  const {
    apiKey,
    voiceId,
    voiceLabel = 'Your narrator',
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
    const data = await callElevenLabs(apiKey, voiceId, cleaned, signal);
    return { data, mimeType: 'audio/mpeg' };
  }

  if (useProjects) {
    try {
      onProgress?.({
        stage: 'synthesizing',
        message: 'Long script — using ElevenLabs Projects…',
      });
      const data = await callElevenLabsProjects(
        apiKey,
        voiceId,
        cleaned,
        signal,
        onProgress,
        projectsPollIntervalMs,
        projectsPollMaxMs
      );
      return { data, mimeType: 'audio/mpeg' };
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

  const data = await callElevenLabsChunked(apiKey, voiceId, cleaned, signal, onProgress, voiceLabel);
  return { data, mimeType: 'audio/wav' };
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

/** fetch() with a hard timeout that still honors an external abort signal.
 *
 *  The bare fetch() has no timeout. On mobile, when the screen turns off
 *  mid-generation the OS suspends the tab and can leave an in-flight request
 *  neither resolved nor rejected — the UI then sits on its current step
 *  indefinitely (the "stuck on Writing script for 20 minutes" bug).
 *  Wrapping every request in a timeout converts that dead state into a
 *  clear, retryable error.
 *
 *  Two abort sources are merged onto one internal controller:
 *    - the caller's `init.signal` (user pressed Cancel / unmount) → AbortError
 *    - the timeout firing                                          → TimeoutError
 *  Callers tell them apart by `err.name` to message the user correctly. */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const externalSignal = init.signal ?? undefined;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(externalSignal?.reason);

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(
      new DOMException(`Request timed out after ${Math.round(timeoutMs / 1000)}s`, 'TimeoutError')
    );
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    // When we aborted for the timeout, some engines surface a generic
    // AbortError rather than the reason we passed — normalize it so the
    // caller can always distinguish timeout from a user cancel.
    if (timedOut) {
      throw new DOMException(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s`,
        'TimeoutError'
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/** Parse the `<title>…</title>` tag from Claude's response.
 *  Returns the title string and the story script with the tag stripped.
 *  Falls back gracefully: if no tag is present, title is empty and the
 *  full text is returned as-is so the caller can use deriveTitle(theme). */
function parseClaudeResponse(raw: string): { title: string; script: string } {
  const match = raw.match(/^<title>([\s\S]*?)<\/title>\s*/);
  if (match) {
    return { title: match[1].trim(), script: raw.slice(match[0].length) };
  }
  return { title: '', script: raw };
}

async function callClaude(
  apiKey: string,
  theme: string,
  signal?: AbortSignal
): Promise<{ title: string; script: string }> {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
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
  return parseClaudeResponse(text);
}

/** Single-chunk ElevenLabs TTS call.
 *
 *  `outputFormat` defaults to MP3 for the short-script and Projects paths.
 *  The chunked path passes `CHUNK_OUTPUT_FORMAT` ('pcm_22050') so each chunk
 *  arrives as raw PCM, ready for arithmetic normalization without any decode
 *  step. The Projects API ignores output_format (it always returns MP3). */
async function callElevenLabs(
  apiKey: string,
  voiceId: string,
  text: string,
  signal?: AbortSignal,
  outputFormat = 'mp3_44100_128'
): Promise<ArrayBuffer> {
  // output_format is a QUERY parameter on this endpoint, not a body field.
  // ElevenLabs silently ignores an unknown body key, so passing it in the
  // JSON body returns the default (mp3_44100_128) regardless of what we
  // asked for. The chunked path then reinterprets those MP3 bytes as raw
  // PCM and the result is pure noise. It must go on the URL.
  const url = new URL(`${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}`);
  url.searchParams.set('output_format', outputFormat);
  const res = await fetchWithTimeout(
    url.toString(),
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

  // Guard against the silent-noise failure mode: if we asked for raw PCM
  // but the server handed back MP3 (e.g. the param was dropped, or the plan
  // tier doesn't support the format), the caller would wrap compressed
  // bytes in a PCM/WAV header and produce noise. Fail loudly instead.
  if (outputFormat.startsWith('pcm')) {
    const ct = res.headers.get('content-type') ?? '';
    if (/mpeg|mp3/i.test(ct)) {
      throw new Error(
        `ElevenLabs returned ${ct} when ${outputFormat} was requested — ` +
          `cannot treat MP3 as raw PCM. Check the account's supported output formats.`
      );
    }
  }

  return res.arrayBuffer();
}

/** Chunked-TTS path. Splits the script at paragraph boundaries, runs
 *  each piece through the standard TTS endpoint sequentially, normalizes
 *  per-chunk loudness, and returns a WAV-wrapped buffer.
 *
 *  Why PCM + WAV instead of MP3 + byte-concat:
 *  The raw MP3 byte-concat approach worked structurally (decoders resync
 *  at frame headers) but each ElevenLabs TTS call can render at a
 *  different level — paragraph 1 quiet, paragraph 2 loud — producing
 *  sudden volume spikes at seams. Fixing that requires modifying the
 *  samples, which in turn requires either (a) a JS MP3 encoder library
 *  or (b) storing uncompressed PCM. We choose (b): request pcm_22050
 *  output from ElevenLabs, normalize per chunk with computeRms /
 *  normalizePcmChunks, then wrap in a 44-byte RIFF header. The result
 *  is stored as audio/wav; Howler plays WAV blobs fine with html5:true.
 *
 *  Sequential rather than parallel: ElevenLabs throttles concurrent
 *  requests on the Creator plan, and the user pays per character either
 *  way. */
export async function callElevenLabsChunked(
  apiKey: string,
  voiceId: string,
  text: string,
  signal?: AbortSignal,
  onProgress?: (step: GenerationStep) => void,
  voiceLabel = 'Your narrator'
): Promise<ArrayBuffer> {
  const chunks = chunkScript(text);
  if (chunks.length === 0) throw new Error('Empty script — nothing to synthesize.');

  // Request raw PCM — each buffer is then a flat Int16Array of 22050 Hz
  // mono samples, ready for arithmetic normalization.
  const pcmChunks: Int16Array[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({
      stage: 'synthesizing',
      message: `${voiceLabel} is reading your story… (part ${i + 1} of ${chunks.length})`,
    });
    const buf = await callElevenLabs(
      apiKey, voiceId, chunks[i]!, signal, CHUNK_OUTPUT_FORMAT
    );
    // ElevenLabs pcm_22050 returns raw 16-bit signed little-endian samples.
    // Truncate to even byte length — a stray trailing byte (odd-length response)
    // would cause "byte length of Int16Array should be a multiple of 2".
    const evenBuf = buf.byteLength % 2 === 0 ? buf : buf.slice(0, buf.byteLength - 1);
    pcmChunks.push(new Int16Array(evenBuf));
  }

  // Normalize per-chunk RMS so no seam has a jarring level jump, then
  // concatenate into one Int16Array.
  const normalized = normalizePcmChunks(pcmChunks);

  // Wrap in a RIFF/WAV header so the browser's <audio> element can play it.
  const header = buildWavHeader(normalized.length, CHUNK_SAMPLE_RATE);
  const wavBuffer = new ArrayBuffer(header.byteLength + normalized.byteLength);
  const wavView = new Uint8Array(wavBuffer);
  wavView.set(new Uint8Array(header), 0);
  wavView.set(
    new Uint8Array(normalized.buffer, normalized.byteOffset, normalized.byteLength),
    header.byteLength
  );
  return wavBuffer;
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
  const createRes = await fetchWithTimeout(`${ELEVENLABS_BASE}/v1/projects`, {
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
    const contentRes = await fetchWithTimeout(
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
  const convertRes = await fetchWithTimeout(
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
  const audioRes = await fetchWithTimeout(
    `${ELEVENLABS_BASE}/v1/projects/${projectId}/chapters/${chapterId}/audio`,
    {
      method: 'GET',
      signal,
      headers: { 'xi-api-key': apiKey },
    },
    DOWNLOAD_TIMEOUT_MS
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

    const res = await fetchWithTimeout(`${ELEVENLABS_BASE}/v1/projects/${projectId}`, {
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
