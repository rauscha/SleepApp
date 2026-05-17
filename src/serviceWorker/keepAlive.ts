// Service-worker keep-alive — periodic postMessage to the active SW.
//
// Why: Chromium parks inactive service workers after ~30 seconds, and an
// unregistered/evicted SW means a cold start has to re-download every
// audio asset over the network. During an overnight playback session
// where the page is hidden and the SW has no fetches to handle, the
// worker would otherwise sit dormant the whole time. A cheap message
// ping keeps it warm enough to serve a fast re-load if the tab is
// reclaimed and the user wakes it.
//
// The SW-side handler lives in `public/sw.js`. Pings are no-op on
// browsers without SW support or when no controller is active yet
// (first visit before the SW has claimed the page).

const PING_INTERVAL_MS = 20_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

function pingOnce(): void {
  if (typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  const controller = navigator.serviceWorker.controller;
  if (!controller) return;
  try {
    controller.postMessage({ type: 'ping' });
  } catch {
    /* worker discarded between check and post — picked up on next interval */
  }
}

/**
 * Start pinging the active service worker every 20s. Idempotent — calling
 * twice in a row is harmless. Pair with stopSwKeepAlive() when playback
 * ends so we don't burn battery pinging an idle SW.
 */
export function startSwKeepAlive(): void {
  if (intervalId !== null) return;
  // Ping immediately so a freshly-registered SW gets a wake before the
  // first interval fires.
  pingOnce();
  intervalId = setInterval(pingOnce, PING_INTERVAL_MS);
}

export function stopSwKeepAlive(): void {
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
}

export function isSwKeepAliveRunning(): boolean {
  return intervalId !== null;
}
