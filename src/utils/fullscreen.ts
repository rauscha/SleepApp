// Fullscreen API helpers. Both calls swallow rejections — the API is
// unavailable in iOS Safari's standalone PWA mode and requires a recent
// user gesture elsewhere. A failure here is purely cosmetic ("the Android
// status bar stays visible"), never worth crashing the app over.

/** True when running as an installed app (no browser chrome to hide). */
export function isInstalledApp(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    return (
      nav.standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      window.matchMedia?.('(display-mode: fullscreen)').matches === true
    );
  } catch {
    return false;
  }
}

export function requestFullscreenSafe(): void {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  try {
    if (document.fullscreenElement) return;
    // Installed, the manifest's `fullscreen` display mode already hides the
    // system bars (2026-10-05). The Fullscreen API on top of it cost Chrome's
    // bright "To exit full screen, drag from the top" toast every time the
    // screen woke, since Android drops API fullscreen whenever the page is
    // hidden (Andrew, 2026-10-04: "Alert box keeps showing up"). The display
    // mode is the app's own window state, so it shows no toast. A browser
    // tab still gets the API.
    if (isInstalledApp()) return;
    const p = el.requestFullscreen
      ? el.requestFullscreen({ navigationUI: 'hide' })
      : el.webkitRequestFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch(() => undefined);
    }
  } catch {
    /* Fullscreen unsupported or rejected. */
  }
}

export function exitFullscreenSafe(): void {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void>;
  };
  try {
    if (!document.fullscreenElement) return;
    const p = doc.exitFullscreen
      ? doc.exitFullscreen()
      : doc.webkitExitFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch(() => undefined);
    }
  } catch {
    /* noop */
  }
}
