import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_SAMPLE_RATE,
  TTS_CHUNK_LIMIT,
  buildStoryMetadata,
  buildWavHeader,
  callElevenLabsChunked,
  callElevenLabsProjects,
  chunkScript,
  computeRms,
  concatArrayBuffers,
  countWords,
  deriveTitle,
  estimateDurationSeconds,
  fetchWithTimeout,
  isLongForm,
  isProjectsEnabled,
  makeStoryId,
  normalizePcmChunks,
  synthesizeStoryAudio,
} from './storyGenerator';

// Pure-function coverage for the story generation pipeline plus
// fetch-mocked coverage for the new long-form paths (Projects API +
// chunked TTS fallback).

describe('countWords', () => {
  it('returns 0 for an empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace only', () => {
    expect(countWords('   \n\t  ')).toBe(0);
  });

  it('counts words split by any whitespace', () => {
    expect(countWords('one two three')).toBe(3);
    expect(countWords('one\ttwo\nthree')).toBe(3);
    expect(countWords('  leading and trailing  ')).toBe(3);
  });

  it('treats consecutive whitespace as one separator', () => {
    expect(countWords('a    b\n\n\nc')).toBe(3);
  });
});

describe('estimateDurationSeconds', () => {
  it('returns 0 for empty script', () => {
    expect(estimateDurationSeconds('')).toBe(0);
  });

  it('uses 130 wpm by default', () => {
    const script = Array(130).fill('word').join(' ');
    expect(estimateDurationSeconds(script)).toBe(60);
  });

  it('respects a custom wpm', () => {
    const script = Array(100).fill('word').join(' ');
    expect(estimateDurationSeconds(script, 100)).toBe(60);
  });

  it('rounds to the nearest second', () => {
    const script = Array(65).fill('word').join(' ');
    expect(estimateDurationSeconds(script)).toBe(30);
  });
});

describe('deriveTitle', () => {
  it('falls back to a generic label for an empty theme', () => {
    expect(deriveTitle('')).toBe('Sleep story');
    expect(deriveTitle('   ')).toBe('Sleep story');
  });

  it('capitalizes the first letter of the theme', () => {
    expect(deriveTitle('a winter cabin')).toBe('A winter cabin');
  });

  it('preserves a theme that already starts capitalized', () => {
    expect(deriveTitle('Mountain dusk')).toBe('Mountain dusk');
  });

  it('trims surrounding whitespace before casing', () => {
    expect(deriveTitle('  autumn forest  ')).toBe('Autumn forest');
  });

  it('returns themes up to 60 chars unchanged (apart from case)', () => {
    const sixty = 'a'.repeat(60);
    expect(deriveTitle(sixty)).toBe('A' + 'a'.repeat(59));
  });

  it('soft-truncates long themes at a word boundary with an ellipsis', () => {
    const long =
      'a slow walk through an autumn forest with leaves crunching beneath your feet at dusk';
    const out = deriveTitle(long);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('  ');
    const stem = out.slice(0, -1);
    const cased = 'A slow walk through an autumn forest with leaves crunching beneath your feet at dusk';
    expect(cased.startsWith(stem)).toBe(true);
    expect(cased.charAt(stem.length)).toBe(' ');
  });

  it('handles a long single-word theme by hard-truncating', () => {
    const long = 'x'.repeat(100);
    const out = deriveTitle(long);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('makeStoryId', () => {
  it('embeds the timestamp', () => {
    expect(makeStoryId(1700000000000, 0.5)).toMatch(/^story-1700000000000-/);
  });

  it('produces a 6-char suffix', () => {
    const id = makeStoryId(1700000000000, 0.123456789);
    const suffix = id.split('-').pop()!;
    expect(suffix).toHaveLength(6);
  });

  it('pads short base36 suffixes to 6 chars', () => {
    const id = makeStoryId(1700000000000, 0);
    const suffix = id.split('-').pop()!;
    expect(suffix).toHaveLength(6);
  });
});

describe('buildStoryMetadata', () => {
  it('assembles all fields with sensible defaults', () => {
    const script = Array(260).fill('word').join(' ');
    const meta = buildStoryMetadata({
      id: 'story-test-123',
      theme: 'a winter cabin',
      voiceName: 'tide',
      script,
      createdAt: '2026-05-15T00:00:00.000Z',
    });
    expect(meta).toEqual({
      id: 'story-test-123',
      title: 'A winter cabin',
      theme: 'a winter cabin',
      voiceId: 'tide',
      createdAt: '2026-05-15T00:00:00.000Z',
      durationSeconds: 120,
      script,
      sceneId: null,
    });
  });

  it('defaults createdAt to now when omitted', () => {
    const before = Date.now();
    const meta = buildStoryMetadata({
      id: 'x',
      theme: 't',
      voiceName: 'tide',
      script: 'hello world',
    });
    const after = Date.now();
    const ts = Date.parse(meta.createdAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('sceneId is always null on a fresh story', () => {
    const meta = buildStoryMetadata({
      id: 'x',
      theme: 't',
      voiceName: 'tide',
      script: 'hello',
    });
    expect(meta.sceneId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Long-form helpers

describe('isLongForm', () => {
  it('returns false for scripts at or under the threshold', () => {
    expect(isLongForm('x'.repeat(TTS_CHUNK_LIMIT))).toBe(false);
    expect(isLongForm('short')).toBe(false);
  });

  it('returns true once the script exceeds the threshold', () => {
    expect(isLongForm('x'.repeat(TTS_CHUNK_LIMIT + 1))).toBe(true);
  });
});

describe('chunkScript', () => {
  it('returns an empty array for empty input', () => {
    expect(chunkScript('')).toEqual([]);
    expect(chunkScript('   \n\n   ')).toEqual([]);
  });

  it('returns a single chunk for input under the limit', () => {
    expect(chunkScript('hello world')).toEqual(['hello world']);
  });

  it('splits at paragraph boundaries when needed', () => {
    const p1 = 'a'.repeat(3000);
    const p2 = 'b'.repeat(3000);
    const out = chunkScript(`${p1}\n\n${p2}`, 4500);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(p1);
    expect(out[1]).toBe(p2);
  });

  it('packs multiple small paragraphs into a single chunk', () => {
    const p = 'x'.repeat(1000);
    const text = [p, p, p, p].join('\n\n'); // 4*1000 + 3*2 sep = 4006 chars
    const out = chunkScript(text, 4500);
    expect(out).toHaveLength(1);
  });

  it('falls back to sentence boundaries inside an oversized paragraph', () => {
    // One paragraph, three sentences, each ~2000 chars. The combined
    // text is 6K+ chars so it cannot fit in one chunk at limit 4500.
    const sent = 'x'.repeat(2000) + '.';
    const para = `${sent} ${sent} ${sent}`;
    const out = chunkScript(para, 4500);
    expect(out.length).toBeGreaterThanOrEqual(2);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(4500);
  });

  it('hard-splits a single oversized sentence when nothing else works', () => {
    const monster = 'x'.repeat(10_000); // no spaces, no terminators
    const out = chunkScript(monster, 4500);
    expect(out.length).toBeGreaterThanOrEqual(3);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(4500);
    expect(out.join('')).toBe(monster);
  });

  it('every chunk respects maxChars', () => {
    const para = ('Sentence about a cabin. '.repeat(300)).trim();
    const out = chunkScript(para, 4500);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(4500);
  });
});

describe('concatArrayBuffers', () => {
  it('concatenates bytes in order', () => {
    const a = new Uint8Array([1, 2, 3]).buffer;
    const b = new Uint8Array([4, 5]).buffer;
    const out = concatArrayBuffers([a, b]);
    expect(Array.from(new Uint8Array(out))).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns an empty buffer for an empty input list', () => {
    const out = concatArrayBuffers([]);
    expect(out.byteLength).toBe(0);
  });

  it('handles a single buffer unchanged', () => {
    const a = new Uint8Array([7, 8, 9]).buffer;
    const out = concatArrayBuffers([a]);
    expect(Array.from(new Uint8Array(out))).toEqual([7, 8, 9]);
  });
});

describe('isProjectsEnabled', () => {
  // Vite inlines `import.meta.env.*` at build time, so tests see the
  // values that were resolved when vitest started. We toggle via stub
  // and restore between cases.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to true when the var is missing', () => {
    vi.stubEnv('VITE_ELEVENLABS_USE_PROJECTS', '');
    expect(isProjectsEnabled()).toBe(true);
  });

  it('returns true for "true"', () => {
    vi.stubEnv('VITE_ELEVENLABS_USE_PROJECTS', 'true');
    expect(isProjectsEnabled()).toBe(true);
  });

  it('returns false for "false"', () => {
    vi.stubEnv('VITE_ELEVENLABS_USE_PROJECTS', 'false');
    expect(isProjectsEnabled()).toBe(false);
  });

  it('is case-insensitive', () => {
    vi.stubEnv('VITE_ELEVENLABS_USE_PROJECTS', 'FALSE');
    expect(isProjectsEnabled()).toBe(false);
    vi.stubEnv('VITE_ELEVENLABS_USE_PROJECTS', 'True');
    expect(isProjectsEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PCM normalization helpers

describe('buildWavHeader', () => {
  it('produces a 44-byte buffer with RIFF/WAVE magic', () => {
    const buf = buildWavHeader(1000, 22050);
    expect(buf.byteLength).toBe(44);
    const view = new DataView(buf);
    // "RIFF"
    expect(view.getUint32(0, false)).toBe(0x52494646);
    // "WAVE"
    expect(view.getUint32(8, false)).toBe(0x57415645);
    // PCM format = 1
    expect(view.getUint16(20, true)).toBe(1);
    // mono
    expect(view.getUint16(22, true)).toBe(1);
    // sample rate
    expect(view.getUint32(24, true)).toBe(22050);
    // bits per sample
    expect(view.getUint16(34, true)).toBe(16);
    // data size = numSamples × 2
    expect(view.getUint32(40, true)).toBe(1000 * 2);
  });

  it('encodes file size correctly', () => {
    const numSamples = 500;
    const buf = buildWavHeader(numSamples, 22050);
    const view = new DataView(buf);
    // ChunkSize = 36 + dataSize = 36 + 1000 = 1036
    expect(view.getUint32(4, true)).toBe(36 + numSamples * 2);
  });
});

describe('computeRms', () => {
  it('returns 0 for empty array', () => {
    expect(computeRms(new Int16Array(0))).toBe(0);
  });

  it('returns 0 for an all-zero array', () => {
    expect(computeRms(new Int16Array([0, 0, 0, 0]))).toBe(0);
  });

  it('returns 1 for full-scale square wave', () => {
    // All samples at 32767 → RMS = 32767/32768 ≈ 1
    const samples = new Int16Array(100).fill(32767);
    expect(computeRms(samples)).toBeCloseTo(1, 2);
  });

  it('is proportional to amplitude', () => {
    const loud = new Int16Array([16000, -16000, 16000, -16000]);
    const soft = new Int16Array([4000,  -4000,  4000,  -4000]);
    const rmsLoud = computeRms(loud);
    const rmsSoft = computeRms(soft);
    expect(rmsLoud / rmsSoft).toBeCloseTo(4, 1);
  });
});

describe('normalizePcmChunks', () => {
  it('returns empty Int16Array for empty input', () => {
    expect(normalizePcmChunks([]).length).toBe(0);
  });

  it('handles all-silent chunks without error', () => {
    const silent = new Int16Array([0, 0, 0, 0]);
    const out = normalizePcmChunks([silent, silent]);
    expect(out.length).toBe(8);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(0);
  });

  it('concatenates samples from all chunks in order', () => {
    // Use non-zero samples so normalization doesn't collapse them
    const c1 = new Int16Array([1000, 2000]);
    const c2 = new Int16Array([3000, 4000]);
    const out = normalizePcmChunks([c1, c2]);
    expect(out.length).toBe(4);
  });

  it('scales a loud chunk down toward a quiet one', () => {
    // c1 is quiet, c2 is 8× louder. After normalization they should be closer.
    const quiet = new Int16Array(100).fill(500);
    const loud = new Int16Array(100).fill(4000);
    const out = normalizePcmChunks([quiet, loud]);
    const c1Rms = computeRms(new Int16Array(out.buffer, 0, 100));
    const c2Rms = computeRms(new Int16Array(out.buffer, 200, 100));
    // Ratio should be much less than the original 8:1
    expect(c2Rms / c1Rms).toBeLessThan(5);
  });

  it('never produces samples outside Int16 range', () => {
    const maxSamples = new Int16Array(100).fill(32000);
    const minSamples = new Int16Array(100).fill(-32000);
    const out = normalizePcmChunks([maxSamples, minSamples]);
    for (let i = 0; i < out.length; i++) {
      expect(out[i] as number).toBeGreaterThanOrEqual(-32768);
      expect(out[i] as number).toBeLessThanOrEqual(32767);
    }
  });
});

// ---------------------------------------------------------------------------
// Fetch-mocked API path tests

type FetchMock = ReturnType<typeof vi.fn>;

function mp3Response(bytes: number[]): Response {
  return new Response(new Uint8Array(bytes).buffer, {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

/** Build a PCM response for chunked-TTS tests.
 *  `samples` are Int16 values; the response carries raw little-endian bytes. */
function pcmResponse(samples: number[]): Response {
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(i * 2, samples[i] as number, true);
  }
  return new Response(buf, {
    status: 200,
    headers: { 'content-type': 'audio/pcm' },
  });
}

/** Return true if buf is a valid WAV file (has RIFF/WAVE magic + data). */
function isValidWav(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 44) return false;
  const view = new DataView(buf);
  return (
    view.getUint32(0, false) === 0x52494646 && // 'RIFF'
    view.getUint32(8, false) === 0x57415645    // 'WAVE'
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('callElevenLabsChunked', () => {
  let fetchMock: FetchMock;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('runs one TTS call per chunk and returns a valid WAV buffer', async () => {
    // Build a script that fits in exactly two chunks.
    const p = 'x'.repeat(3000);
    const script = `${p}\n\n${p}`;

    // Mock with PCM responses — 4 samples each (tiny but valid)
    fetchMock.mockResolvedValueOnce(pcmResponse([1000, -1000, 2000, -2000]));
    fetchMock.mockResolvedValueOnce(pcmResponse([3000, -3000, 4000, -4000]));

    const buf = await callElevenLabsChunked('key', 'voice-1', script);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(isValidWav(buf)).toBe(true);
    // 4 + 4 = 8 samples total → data section = 16 bytes, total = 60 bytes
    expect(buf.byteLength).toBe(44 + 8 * 2);

    // Each request hits the standard TTS endpoint with correct params.
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toContain('/v1/text-to-speech/voice-1');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.model_id).toBe('eleven_multilingual_v2');
      expect(body.output_format).toBe('pcm_22050');
      expect(typeof body.text).toBe('string');
    }
  });

  it('WAV header encodes the correct sample rate', async () => {
    const p = 'x'.repeat(3000);
    const script = `${p}\n\n${p}`;
    fetchMock.mockImplementation(() =>
      Promise.resolve(pcmResponse([100, -100]))
    );

    const buf = await callElevenLabsChunked('key', 'voice-1', script);
    const view = new DataView(buf);
    expect(view.getUint32(24, true)).toBe(CHUNK_SAMPLE_RATE);
  });

  it('surfaces a chunk failure with the script-length context', async () => {
    const p = 'x'.repeat(3000);
    const script = `${p}\n\n${p}`;
    fetchMock.mockResolvedValueOnce(pcmResponse([100, -100]));
    fetchMock.mockResolvedValueOnce(
      new Response('quota exceeded', { status: 422 })
    );

    await expect(
      callElevenLabsChunked('key', 'voice-1', script)
    ).rejects.toThrow(/ElevenLabs API error 422/);
  });

  it('reports progress per chunk', async () => {
    const p = 'x'.repeat(3000);
    const script = `${p}\n\n${p}`;
    // Factory mock so each call gets a fresh Response body
    // (Response bodies can only be consumed once).
    fetchMock.mockImplementation(() =>
      Promise.resolve(pcmResponse([0, 0]))
    );

    const steps: string[] = [];
    await callElevenLabsChunked('key', 'voice-1', script, undefined, (s) => {
      if (s.stage === 'synthesizing') steps.push(s.message);
    });
    expect(steps).toEqual([
      'Synthesizing chunk 1 of 2…',
      'Synthesizing chunk 2 of 2…',
    ]);
  });
});

describe('callElevenLabsProjects', () => {
  let fetchMock: FetchMock;
  const originalFetch = globalThis.fetch;
  // Tiny poll interval so tests don't sit on the real 5s cadence.
  const FAST_POLL = 1;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('walks create → convert → poll → download and returns audio', async () => {
    // 1) create
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ project_id: 'p1', chapter_id: 'c1' })
    );
    // 2) convert
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    // 3) poll: pending then converted
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'in_progress', chapters: [{ chapter_id: 'c1' }] })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'converted', chapters: [{ chapter_id: 'c1' }] })
    );
    // 4) audio download
    fetchMock.mockResolvedValueOnce(mp3Response([9, 9, 9, 9]));

    const buf = await callElevenLabsProjects(
      'key',
      'voice-1',
      'long script',
      undefined,
      undefined,
      FAST_POLL
    );

    expect(Array.from(new Uint8Array(buf))).toEqual([9, 9, 9, 9]);

    // Verify endpoint sequence.
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toMatch(/\/v1\/projects$/);
    expect(urls[1]).toMatch(/\/v1\/projects\/p1\/convert$/);
    expect(urls[2]).toMatch(/\/v1\/projects\/p1$/);
    expect(urls[3]).toMatch(/\/v1\/projects\/p1$/);
    expect(urls[4]).toMatch(/\/v1\/projects\/p1\/chapters\/c1\/audio$/);

    // Create payload mentions both voice id and the script.
    const createBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(createBody.default_paragraph_voice_id).toBe('voice-1');
    expect(createBody.content).toBe('long script');
  });

  it('calls the content endpoint when create did not auto-attach', async () => {
    // create response without chapter_id / chapters
    fetchMock.mockResolvedValueOnce(jsonResponse({ project_id: 'p2' }));
    // content
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    // convert
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    // poll converted with chapter id
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'converted', chapters: [{ chapter_id: 'cX' }] })
    );
    // audio
    fetchMock.mockResolvedValueOnce(mp3Response([1, 2]));

    await callElevenLabsProjects(
      'key',
      'voice-1',
      'script',
      undefined,
      undefined,
      FAST_POLL
    );

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[1]).toMatch(/\/v1\/projects\/p2\/content$/);
    expect(urls[2]).toMatch(/\/v1\/projects\/p2\/convert$/);
  });

  it('throws when the create call fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(
      callElevenLabsProjects(
        'key',
        'voice-1',
        'script',
        undefined,
        undefined,
        FAST_POLL
      )
    ).rejects.toThrow(/Projects create failed 500/);
  });

  it('throws when the poll surfaces a failed status', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ project_id: 'p3', chapter_id: 'c3' })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true })); // convert
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'failed' }));
    await expect(
      callElevenLabsProjects(
        'key',
        'voice-1',
        'script',
        undefined,
        undefined,
        FAST_POLL
      )
    ).rejects.toThrow(/conversion reported status "failed"/);
  });
});

describe('synthesizeStoryAudio dispatcher', () => {
  let fetchMock: FetchMock;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses standard TTS for scripts at or under the threshold', async () => {
    fetchMock.mockResolvedValueOnce(mp3Response([1]));
    const result = await synthesizeStoryAudio({
      apiKey: 'k',
      voiceId: 'v',
      text: 'short script',
      useProjects: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][0] as string)).toMatch(
      /\/v1\/text-to-speech\/v$/
    );
    // Short-script path is MP3 (no normalization needed for a single call)
    expect(result.mimeType).toBe('audio/mpeg');
  });

  it('uses Projects for long scripts when the flag is on', async () => {
    const long = 'x'.repeat(TTS_CHUNK_LIMIT + 1);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ project_id: 'p', chapter_id: 'c' })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true })); // convert
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'converted', chapters: [{ chapter_id: 'c' }] }));
    fetchMock.mockResolvedValueOnce(mp3Response([7]));

    const result = await synthesizeStoryAudio({
      apiKey: 'k',
      voiceId: 'v',
      text: long,
      useProjects: true,
      projectsPollIntervalMs: 1,
    });

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toMatch(/\/v1\/projects$/);
    // Projects path returns single MP3
    expect(result.mimeType).toBe('audio/mpeg');
  });

  it('uses chunked TTS for long scripts when the flag is off', async () => {
    // Two chunks worth of text
    const p = 'x'.repeat(3000);
    const text = `${p}\n\n${p}`;
    fetchMock.mockResolvedValueOnce(pcmResponse([100, -100, 200, -200]));
    fetchMock.mockResolvedValueOnce(pcmResponse([300, -300, 400, -400]));

    const result = await synthesizeStoryAudio({
      apiKey: 'k',
      voiceId: 'v',
      text,
      useProjects: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url] of fetchMock.mock.calls) {
      expect(url).toMatch(/\/v1\/text-to-speech\/v$/);
    }
    // Chunked path returns WAV
    expect(result.mimeType).toBe('audio/wav');
    expect(isValidWav(result.data)).toBe(true);
  });

  it('falls back to chunked TTS when Projects errors — returns WAV', async () => {
    const p = 'x'.repeat(3000);
    const text = `${p}\n\n${p}`;
    // Projects create fails
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    // Fallback: two chunked TTS calls (PCM)
    fetchMock.mockResolvedValueOnce(pcmResponse([1000, -1000]));
    fetchMock.mockResolvedValueOnce(pcmResponse([2000, -2000]));

    const result = await synthesizeStoryAudio({
      apiKey: 'k',
      voiceId: 'v',
      text,
      useProjects: true,
    });

    expect(result.mimeType).toBe('audio/wav');
    expect(isValidWav(result.data)).toBe(true);
    // 1 failed projects call + 2 chunked TTS calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does NOT fall back on AbortError — propagates so the UI can show "Cancelled"', async () => {
    const long = 'x'.repeat(TTS_CHUNK_LIMIT + 1);
    fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    await expect(
      synthesizeStoryAudio({
        apiKey: 'k',
        voiceId: 'v',
        text: long,
        useProjects: true,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    // Only the Projects-create attempt — no fallback fired.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// fetchWithTimeout — the mobile "stuck forever" guard

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A fetch that never settles on its own — it only rejects when its
  // signal aborts. Mirrors a request the OS froze after the screen slept.
  const hangingFetch = () =>
    vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const sig = init?.signal;
          if (sig?.aborted) {
            reject(sig.reason ?? new DOMException('Aborted', 'AbortError'));
            return;
          }
          sig?.addEventListener('abort', () =>
            reject(sig.reason ?? new DOMException('Aborted', 'AbortError'))
          );
        })
    );

  it('rejects with TimeoutError when the request outlasts the timeout', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    // Short real timeout so the test is fast but exercises the real timer.
    await expect(
      fetchWithTimeout('https://example.test', {}, 20)
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('rejects with AbortError (not TimeoutError) when the caller aborts', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      fetchWithTimeout('https://example.test', { signal: ctrl.signal }, 10_000)
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('passes a successful response through unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }))
    );
    const res = await fetchWithTimeout('https://example.test', {}, 10_000);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(3);
  });
});
