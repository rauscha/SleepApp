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
    // Installed, the app already has no browser bar, and Android's status
    // bar takes the manifest's near-black theme colour. Going fullscreen on
    // top of that bought little and cost Chrome's bright "To exit full
    // screen, drag from the top" toast every time the screen woke, since
    // Android drops fullscreen whenever the page is hidden (Andrew,
    // 2026-10-04: "Alert box keeps showing up"). A browser tab still gets it.
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
