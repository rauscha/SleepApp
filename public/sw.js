// Service worker for the Sleep app.
//
// The One Thing failure mode is a silent gap mid-night. The cache policy
// is shaped around that: once a scene has played for the first time, its
// audio files must still be available on the next cold start even if the
// device is offline (airplane mode, dropped Wi-Fi, sleeping AP). At the
// same time, a buggy new worker must NEVER take over a session that is
// already playing audio — we skip `skipWaiting()` and let new versions
// activate only on the next cold start.
//
// Cache buckets:
//   - sleep-audio-vN    : /audio/**, /worklets/**, /meditations/**,
//                         /stories/**.mp3 — cache-first. Once a buffer is
//                         fetched it's pinned for the lifetime of this cache
//                         version. The browser may still evict under storage
//                         pressure; that's a re-fetch on miss, not a logic
//                         error. Story MP3s are bundled at ~17 MB each —
//                         worth caching greedily so a mid-night replay never
//                         goes to network.
//   - sleep-scenes-vN   : /scenes/**.json — stale-while-revalidate. Scene
//                         catalogue can be edited; serve cached for speed,
//                         refresh in background.
//   - sleep-shell-vN    : / and /assets/** (Vite-hashed JS/CSS) —
//                         navigations are network-first with cache fallback;
//                         hashed assets are stale-while-revalidate.
//
// Bumping CACHE_VERSION cleans old caches on the next activation. Don't
// bump it casually — every active install will re-download all audio.

const CACHE_VERSION = 'v2';
const AUDIO_CACHE = `sleep-audio-${CACHE_VERSION}`;
const SCENE_CACHE = `sleep-scenes-${CACHE_VERSION}`;
const SHELL_CACHE = `sleep-shell-${CACHE_VERSION}`;
const KNOWN_CACHES = new Set([AUDIO_CACHE, SCENE_CACHE, SHELL_CACHE]);

// Deploy-base prefix, e.g. '/SleepApp/' on GitHub Pages or '/' on a root
// deploy. Derived from the SW registration scope so the same file works at
// any base without a Vite-time substitution. Always has a trailing slash —
// path matchers below can safely do `${BASE}audio/` without double slashes.
const BASE = new URL('./', self.registration.scope).pathname;

// Precache manifest. The marker comment is what the vite-build-time
// plugin (`swPrecachePlugin` in vite.config.ts) substitutes with the
// actual hashed asset list. In dev — or any environment where the build
// step hasn't run — this array is empty and the SW falls back to lazy
// stale-while-revalidate.
const APP_SHELL = /* @sw-precache */ [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Add each URL individually so a single 404 doesn't fail the whole
      // precache — addAll() is atomic, addAll([404]) rejects the lot.
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            // cache: 'reload' to bypass the HTTP cache — we want the freshest
            // copy of each asset at install time, not whatever happens to be
            // in the browser's disk cache.
            const res = await fetch(url, { cache: 'reload' });
            if (res.ok && res.status === 200) {
              await cache.put(url, res);
            }
          } catch {
            // Best-effort: missing one asset is recoverable via lazy SWR.
          }
        })
      );
    })()
  );
  // Intentionally NOT calling self.skipWaiting(). The current worker keeps
  // serving any open tab — audio sessions are not interrupted. The new
  // worker activates on the next cold start.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('sleep-') && !KNOWN_CACHES.has(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Page-driven keep-alive ping. The page postMessages { type: 'ping' } on
// an interval while audio is playing; receiving the message wakes the
// worker if it had been parked by the browser. This is the only reliable
// way to keep a SW warm — periodicSync requires installed-PWA + user
// permission and isn't available everywhere we care about.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'ping') {
    // No real work needed — just answering wakes the worker. If the
    // sender included a port, send a pong so they can confirm the SW
    // is alive (useful for diagnostics).
    const port = event.ports && event.ports[0];
    if (port) {
      port.postMessage({ type: 'pong', ts: Date.now() });
    }
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Pass through cross-origin (Inter font CSS, ElevenLabs / Anthropic APIs).
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  if (
    path.startsWith(`${BASE}audio/`) ||
    path.startsWith(`${BASE}worklets/`) ||
    path.startsWith(`${BASE}meditations/`) ||
    (path.startsWith(`${BASE}stories/`) && path.endsWith('.mp3'))
  ) {
    event.respondWith(cacheFirst(req, AUDIO_CACHE));
    return;
  }

  // /stories/index.json — stale-while-revalidate (small catalogue file,
  // similar pattern to scenes/index.json).
  if (path.startsWith(`${BASE}stories/`)) {
    event.respondWith(staleWhileRevalidate(req, SCENE_CACHE));
    return;
  }

  if (path.startsWith(`${BASE}scenes/`)) {
    event.respondWith(staleWhileRevalidate(req, SCENE_CACHE));
    return;
  }

  if (
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html')
  ) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  // Hashed JS/CSS, manifest, icons — stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  // Only cache full 200 responses. 206 partial-content (range requests for
  // <audio> seeking) MUST NOT be cached — replaying a 206 for a full request
  // would give the page a truncated buffer.
  if (res && res.ok && res.status === 200) {
    cache.put(req, res.clone()).catch(() => undefined);
  }
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok && res.status === 200) {
        cache.put(req, res.clone()).catch(() => undefined);
      }
      return res;
    })
    .catch(() => null);
  if (cached) {
    // Kick off the revalidate, ignore its result for this response.
    void fetchPromise;
    return cached;
  }
  const net = await fetchPromise;
  if (net) return net;
  return new Response('', { status: 504, statusText: 'Offline' });
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok && res.status === 200) {
      cache.put(req, res.clone()).catch(() => undefined);
    }
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const shell = await cache.match(BASE);
    if (shell) return shell;
    return new Response('Offline', { status: 504, statusText: 'Offline' });
  }
}
