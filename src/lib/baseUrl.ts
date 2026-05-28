// Vite's BASE_URL is the deploy prefix with a trailing slash — '/SleepApp/'
// on GitHub Pages, '/' on a root deploy. This helper composes a runtime URL
// from a public-folder path so the same code works at any base. Kept tiny
// and dependency-free so the audio and offline-precache layers can share it
// without dragging in extra modules.

export function resolvePublicUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
