import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TTS_CHUNK_LIMIT,
  buildStoryMetadata,
  callElevenLabsChunked,
  callElevenLabsProjects,
  chunkScript,
  concatArrayBuffers,
  countWords,
  deriveTitle,
  estimateDurationSeconds,
  isLongForm,
  isProjectsEnabled,
  makeStoryId,
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
// Fetch-mocked API path tests

type FetchMock = ReturnType<typeof vi.fn>;

function mp3Response(bytes: number[]): Response {
  return new Response(new Uint8Array(bytes).buffer, {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
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

  it('runs one TTS call per chunk and concatenates the bytes', async () => {
    // Build a script that fits in exactly two chunks.
    const p = 'x'.repeat(3000);
    const script = `${p}\n\n${p}`;

    fetchMock.mockResolvedValueOnce(mp3Response([1, 2, 3]));
    fetchMock.mockResolvedValueOnce(mp3Response([4, 5, 6]));

    const buf = await callElevenLabsChunked('key', 'voice-1', script);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Array.from(new Uint8Array(buf))).toEqual([1, 2, 3, 4, 5, 6]);

    // Each request hits the standard TTS endpoint with the voice id.
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toContain('/v1/text-to-speech/voice-1');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.model_id).toBe('eleven_multilingual_v2');
      expect(typeof body.text).toBe('string');
    }
  });

  it('surfaces a chunk failure with the script-length context', async () => {
    const p = 'x'.repeat(3000);
    const script = `${p}\n\n${p}`;
    fetchMock.mockResolvedValueOnce(mp3Response([1, 2, 3]));
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
      Promise.resolve(mp3Response([0]))
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
    await synthesizeStoryAudio({
      apiKey: 'k',
      voiceId: 'v',
      text: 'short script',
      useProjects: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][0] as string)).toMatch(
      /\/v1\/text-to-speech\/v$/
    );
  });

  it('uses Projects for long scripts when the flag is on', async () => {
    const long = 'x'.repeat(TTS_CHUNK_LIMIT + 1);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ project_id: 'p', chapter_id: 'c' })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true })); // convert
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'converted', chapters: [{ chapter_id: 'c' }] }));
    fetchMock.mockResolvedValueOnce(mp3Response([7]));

    await synthesizeStoryAudio({
      apiKey: 'k',
      voiceId: 'v',
      text: long,
      useProjects: true,
      projectsPollIntervalMs: 1,
    });

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toMatch(/\/v1\/projects$/);
  });

  it('uses chunked TTS for long scripts when the flag is off', async () => {
    // Two chunks worth of text
    const p = 'x'.repeat(3000);
    const text = `${p}\n\n${p}`;
    fetchMock.mockResolvedValueOnce(mp3Response([1]));
    fetchMock.mockResolvedValueOnce(mp3Response([2]));

    await synthesizeStoryAudio({
      apiKey: 'k',
      voiceId: 'v',
      text,
      useProjects: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url] of fetchMock.mock.calls) {
      expect(url).toMatch(/\/v1\/text-to-speech\/v$/);
    }
  });

  it('falls back to chunked TTS when Projects errors', async () => {
    const p = 'x'.repeat(3000);
    const text = `${p}\n\n${p}`;
    // Projects create fails
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    // Fallback: two chunked TTS calls
    fetchMock.mockResolvedValueOnce(mp3Response([1, 2]));
    fetchMock.mockResolvedValueOnce(mp3Response([3, 4]));

    const buf = await synthesizeStoryAudio({
      apiKey: 'k',
      voiceId: 'v',
      text,
      useProjects: true,
    });

    expect(Array.from(new Uint8Array(buf))).toEqual([1, 2, 3, 4]);
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
