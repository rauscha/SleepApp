// Service-worker Range-request handling (review bug M3 / roadmap 3.4).
//
// iOS Safari issues Range requests for <audio> and breaks when a ranged
// request is answered with a full-body 200. The SW must slice a real 206
// from the cached body. public/sw.js is a plain SW script (not an importable
// module — it touches self.registration at load), so we load its source via
// import.meta.glob('?raw'), evaluate it with mock globals, and exercise its
// actual parseRange / rangedResponse functions. No logic is duplicated here.

import { describe, expect, it, vi, afterEach } from 'vitest';

const swSource = Object.values(
  import.meta.glob('/public/sw.js', { query: '?raw', import: 'default', eager: true })
)[0] as string;

interface SwExports {
  parseRange: (header: string, total: number) => { start: number; end: number } | null;
  rangedResponse: (
    req: { url: string; headers: Headers },
    cache: { match: (req: unknown) => Promise<Response | undefined> },
    rangeHeader: string
  ) => Promise<Response>;
}

function loadSw(): SwExports {
  const mockSelf = {
    registration: { scope: 'https://app.test/SleepApp/' },
    location: { origin: 'https://app.test' },
    clients: { claim: () => Promise.resolve() },
    addEventListener: () => undefined,
  };
  // Append a return so we can reach the SW's internal functions.
  const factory = new Function(
    'self',
    `${swSource}\n;return { parseRange, rangedResponse };`
  );
  return factory(mockSelf) as SwExports;
}

const sw = loadSw();

describe('sw parseRange', () => {
  it('parses a closed range', () => {
    expect(sw.parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(sw.parseRange('bytes=200-499', 1000)).toEqual({ start: 200, end: 499 });
  });

  it('parses an open-ended range to the last byte', () => {
    expect(sw.parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
  });

  it('parses a suffix range as the last N bytes', () => {
    expect(sw.parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    // Suffix larger than the body clamps to the whole body.
    expect(sw.parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('clamps an end past the body to the last byte', () => {
    expect(sw.parseRange('bytes=0-100000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('returns null for unsatisfiable or malformed ranges', () => {
    expect(sw.parseRange('bytes=2000-3000', 1000)).toBeNull(); // start past end
    expect(sw.parseRange('bytes=500-200', 1000)).toBeNull(); // start > end
    expect(sw.parseRange('bytes=abc', 1000)).toBeNull();
    expect(sw.parseRange('bytes=0-1,2-3', 1000)).toBeNull(); // multi-range
    expect(sw.parseRange('bytes=-0', 1000)).toBeNull(); // zero-length suffix
  });
});

describe('sw rangedResponse', () => {
  afterEach(() => vi.unstubAllGlobals());

  function cacheWith(bytes: number[]): {
    match: () => Promise<Response>;
  } {
    return {
      match: async () =>
        new Response(new Uint8Array(bytes), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
    };
  }

  it('serves a 206 sliced from the cached full body', async () => {
    const cache = cacheWith([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const req = { url: 'https://app.test/SleepApp/audio/x.mp3', headers: new Headers() };
    const res = await sw.rangedResponse(req, cache, 'bytes=2-5');
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(res.headers.get('Content-Length')).toBe('4');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    const out = new Uint8Array(await res.arrayBuffer());
    expect([...out]).toEqual([2, 3, 4, 5]);
  });

  it('serves an open-ended range to the end of the body', async () => {
    const cache = cacheWith([10, 11, 12, 13, 14]);
    const req = { url: 'https://app.test/SleepApp/audio/x.mp3', headers: new Headers() };
    const res = await sw.rangedResponse(req, cache, 'bytes=3-');
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 3-4/5');
    const out = new Uint8Array(await res.arrayBuffer());
    expect([...out]).toEqual([13, 14]);
  });

  it('returns 416 for an unsatisfiable range', async () => {
    const cache = cacheWith([0, 1, 2]);
    const req = { url: 'https://app.test/SleepApp/audio/x.mp3', headers: new Headers() };
    const res = await sw.rangedResponse(req, cache, 'bytes=99-200');
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */3');
  });

  it('falls back to the network when the body is not cached', async () => {
    const cache = { match: async () => undefined };
    const networkRes = new Response(new Uint8Array([9, 9]), { status: 206 });
    const fetchSpy = vi.fn(async () => networkRes);
    vi.stubGlobal('fetch', fetchSpy);
    const req = { url: 'https://app.test/SleepApp/audio/x.mp3', headers: new Headers() };
    const res = await sw.rangedResponse(req, cache, 'bytes=0-1');
    expect(res).toBe(networkRes);
    // One ranged passthrough + one background full fetch for next time.
    expect(fetchSpy).toHaveBeenCalled();
  });
});
