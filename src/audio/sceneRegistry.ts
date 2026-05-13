// Scene registry — fetches the index of available scenes and individual
// SceneDefinition JSON files from /public/scenes.
//
// Scenes ship as static JSON in /public/scenes so the audio engine,
// the future Tonight screen (Phase 3), and any later "share scene" flow
// all read the same on-disk format. The index file lists what's
// available without forcing a fetch of every full definition up front.

import type { SceneDefinition } from './sceneFormat';

export interface SceneIndexEntry {
  id: string;
  label: string;
  /** One-line evocation of the scene — shown on the Tonight cards. */
  description?: string;
  /** Path to the full SceneDefinition JSON, relative to the site root. */
  url: string;
}

export interface SceneIndex {
  scenes: SceneIndexEntry[];
}

/** Resolve a public-folder path against Vite's BASE_URL. */
function resolvePublicUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function fetchSceneIndex(): Promise<SceneIndex> {
  const url = resolvePublicUrl('/scenes/index.json');
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load scene index from ${url}: ${res.status}`);
  }
  return (await res.json()) as SceneIndex;
}

export async function fetchSceneDefinition(
  entry: SceneIndexEntry
): Promise<SceneDefinition> {
  const url = resolvePublicUrl(entry.url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load scene ${entry.id} from ${url}: ${res.status}`);
  }
  const def = (await res.json()) as SceneDefinition;
  if (def.id !== entry.id) {
    // Index and definition disagreeing means someone hand-edited one
    // and not the other — surface it now rather than at runtime.
    throw new Error(
      `Scene index entry id "${entry.id}" does not match definition id "${def.id}".`
    );
  }
  return def;
}
