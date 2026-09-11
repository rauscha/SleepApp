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
// The ping is REFERENCE-COUNTED by holder, because two independent things
// want it and they overlap: the playback session (HowlScenePlayer, for as
// long as a scene bed is playing) and ContentPlayerScreen (for bare,
// unpaired narration). With a single on/off flag the *second* holder to
// stand down killed the ping out from under the first — start a Tonight
// scene, play a bare meditation over it, back out of the meditation, and
// the scene played the rest of the night with a dormant service worker.
// Holders are idempotent: starting twice under the same name is one hold.
//
// The SW-side handler lives in `public/sw.js`. Pings are no-op on
// browsers without SW support or when no controller is active yet
// (first visit before the SW has claimed the page).

const PING_INTERVAL_MS = 20_000;

/** Named holders currently wanting the ping. Ping runs while non-empty. */
const holders = new Set<string>();
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
 * Register `holder` as wanting the SW ping, starting it if it wasn't
 * already running. Idempotent per holder. Pair with stopSwKeepAlive(holder)
 * — the ping stops only once every holder has stood down.
 */
export function startSwKeepAlive(holder = 'default'): void {
  const wasIdle = holders.size === 0;
  holders.add(holder);
  if (!wasIdle || intervalId !== null) return;
  // Ping immediately so a freshly-registered SW gets a wake before the
  // first interval fires.
  pingOnce();
  intervalId = setInterval(pingOnce, PING_INTERVAL_MS);
}

/** Release `holder`'s hold. The ping stops when the last holder releases. */
export function stopSwKeepAlive(holder = 'default'): void {
  if (!holders.delete(holder)) return;
  if (holders.size > 0) return;
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
}

export function isSwKeepAliveRunning(): boolean {
  return intervalId !== null;
}

/** Current holder names — diagnostics and tests. */
export function swKeepAliveHolders(): string[] {
  return [...holders];
}

/** Test hook — drop every hold and stop the ping. */
export function __resetSwKeepAliveForTests(): void {
  holders.clear();
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
