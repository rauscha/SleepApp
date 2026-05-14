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
//   - sleep-audio-vN    : /audio/**, /worklets/**, /meditations/** — cache-first.
//                         Once a buffer is fetched it's pinned for the
//                         lifetime of this cache version. The browser may
//                         still evict under storage pressure; that's a
//                         re-fetch on miss, not a logic error.
//   - sleep-scenes-vN   : /scenes/**.json — stale-while-revalidate. Scene
//                         catalogue can be edited; serve cached for speed,
//                         refresh in background.
//   - sleep-shell-vN    : / and /assets/** (Vite-hashed JS/CSS) —
//                         navigations are network-first with cache fallback;
//                         hashed assets are stale-while-revalidate.
//
// Bumping CACHE_VERSION cleans old caches on the next activation. Don't
// bump it casually — every active install will re-download all audio.

const CACHE_VERSION = 'v1';
const AUDIO_CACHE = `sleep-audio-${CACHE_VERSION}`;
const SCENE_CACHE = `sleep-scenes-${CACHE_VERSION}`;
const SHELL_CACHE = `sleep-shell-${CACHE_VERSION}`;
const KNOWN_CACHES = new Set([AUDIO_CACHE, SCENE_CACHE, SHELL_CACHE]);

const APP_SHELL = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // App-shell precache is best-effort: a failure here would block the
      // worker from installing at all, which is worse than running without
      // a precache.
      .then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Pass through cross-origin (Inter font CSS, ElevenLabs / Anthropic APIs).
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  if (
    path.startsWith('/audio/') ||
    path.startsWith('/worklets/') ||
    path.startsWith('/meditations/')
  ) {
    event.respondWith(cacheFirst(req, AUDIO_CACHE));
    return;
  }

  if (path.startsWith('/scenes/')) {
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
    const shell = await cache.match('/');
    if (shell) return shell;
    return new Response('Offline', { status: 504, statusText: 'Offline' });
  }
}
