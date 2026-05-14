// Fullscreen API helpers. Both calls swallow rejections — the API is
// unavailable in iOS Safari's standalone PWA mode and requires a recent
// user gesture elsewhere. A failure here is purely cosmetic ("the Android
// status bar stays visible"), never worth crashing the app over.

export function requestFullscreenSafe(): void {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  try {
    if (document.fullscreenElement) return;
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
