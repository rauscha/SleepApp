// Offline pre-hydration. Walks the asset graph (scene index → scene defs →
// every variant URL, plus meditation + bundled-story indexes, plus the
// worklet and self-hosted Inter font) and pulls each URL through `fetch()`.
// The service worker in public/sw.js intercepts those fetches and stores
// them in the right cache (`/audio/`, `/worklets/`, `/meditations/`, and
// `/stories/*.mp3` are cache-first; scene + story index JSON are
// stale-while-revalidate). This module therefore never opens a cache by
// name — the SW is the single source of truth for cache contents, and we
// avoid duplicating the CACHE_VERSION constant across two files.
//
// Idempotent: re-running after a full download is essentially a no-op —
// each URL is checked against `caches.match()` first and the fetch is
// skipped on hit.

import { fetchSceneIndex, fetchSceneDefinition } from '../audio/sceneRegistry';
import type {
  BundledStoryIndex,
  MeditationIndex,
} from '../storage/types';

/** Resolve a public-folder path against Vite's BASE_URL. Mirrors the
 *  helper in sceneRegistry.ts — duplicated to avoid widening that module's
 *  public surface. */
function resolvePublicUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

// Static URLs that don't appear in any scene/meditation/story index but
// the app still needs to launch offline. The Vite build-time SW precache
// already covers these on install — adding them here is harmless and
// covers the rare case where the SW's install precache failed for one
// asset (it's best-effort, see public/sw.js install handler).
const STATIC_URLS = [
  '/worklets/noise-processor.js',
  '/fonts/InterVariable.woff2',
];

export interface PrecacheProgress {
  done: number;
  total: number;
  /** URL most recently processed (null before the first iteration). */
  currentUrl: string | null;
}

export interface PrecacheOptions {
  signal?: AbortSignal;
  onProgress?: (p: PrecacheProgress) => void;
}

export interface OfflineStatus {
  /** Number of URLs already present in some cache. */
  cachedCount: number;
  /** Total URLs the app would download for full offline support. */
  totalCount: number;
  /** True when every discovered URL is cached. */
  complete: boolean;
}

/** Resolve every URL the app needs in cache to play fully offline. */
export async function buildOfflineUrlList(): Promise<string[]> {
  const urls = new Set<string>();
  for (const p of STATIC_URLS) urls.add(resolvePublicUrl(p));

  const sceneIndex = await fetchSceneIndex();
  urls.add(resolvePublicUrl('/scenes/index.json'));
  for (const entry of sceneIndex.scenes) {
    urls.add(resolvePublicUrl(entry.url));
    const def = await fetchSceneDefinition(entry);
    for (const el of def.elements) {
      for (const v of el.variants) {
        urls.add(resolvePublicUrl(v.url));
      }
    }
  }

  urls.add(resolvePublicUrl('/meditations/index.json'));
  try {
    const res = await fetch(resolvePublicUrl('/meditations/index.json'));
    if (res.ok) {
      const idx = (await res.json()) as MeditationIndex;
      for (const m of idx.meditations) {
        urls.add(resolvePublicUrl(`/meditations/${m.audioPath}`));
      }
    }
  } catch {
    // No meditations index yet — non-fatal.
  }

  urls.add(resolvePublicUrl('/stories/index.json'));
  try {
    const res = await fetch(resolvePublicUrl('/stories/index.json'));
    if (res.ok) {
      const idx = (await res.json()) as BundledStoryIndex;
      for (const s of idx.stories) {
        urls.add(resolvePublicUrl(`/stories/${s.audioPath}`));
      }
    }
  } catch {
    // No bundled-stories index yet — non-fatal.
  }

  return Array.from(urls);
}

export async function getOfflineStatus(): Promise<OfflineStatus> {
  const urls = await buildOfflineUrlList();
  let cachedCount = 0;
  for (const url of urls) {
    if (await caches.match(url)) cachedCount++;
  }
  return {
    cachedCount,
    totalCount: urls.length,
    complete: urls.length > 0 && cachedCount === urls.length,
  };
}

export async function precacheOfflineAssets(
  opts: PrecacheOptions = {}
): Promise<void> {
  const { signal, onProgress } = opts;
  const urls = await buildOfflineUrlList();
  const total = urls.length;
  let done = 0;

  onProgress?.({ done, total, currentUrl: null });

  for (const url of urls) {
    if (signal?.aborted) {
      throw new DOMException('Precache aborted', 'AbortError');
    }
    try {
      const existing = await caches.match(url);
      if (!existing) {
        const res = await fetch(url, { signal });
        if (res.ok) {
          // Drain the body so the SW finishes writing to its cache. The
          // SW clones the response before returning it to us, so the
          // cached copy survives even when we discard these bytes.
          await res.arrayBuffer();
        }
      }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') throw err;
      // A single failing URL shouldn't kill the batch — most likely a
      // 404 on a hand-edited scene def. Log and continue.
      // eslint-disable-next-line no-console
      console.warn('Offline precache: failed for', url, err);
    }
    done++;
    onProgress?.({ done, total, currentUrl: url });
  }
}

/** True when the service worker is controlling this page. Outside of
 *  prod-built + installed contexts (e.g. plain `vite dev`) this is false
 *  and the precache UI should be disabled — no SW means no persistence. */
export function isServiceWorkerControlling(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    navigator.serviceWorker.controller !== null
  );
}
