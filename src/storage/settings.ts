// Settings storage backed by localStorage.
//
// localStorage is fine for settings (small, synchronous, JSON-friendly).
// IndexedDB is for audio assets (large binary blobs) — see assets.ts.
//
// Why a single 'sleep-app:settings' blob instead of per-key entries?
//   - Simpler migrations: read once, fill defaults, write once.
//   - Atomic writes: no torn reads if multiple tabs ever exist.
//   - Smaller surface area: future cloud implementations swap a single
//     read/write pair instead of a key-by-key shim.

import type { UserSettings } from './types';

const STORAGE_KEY = 'sleep-app:settings:v1';

export const DEFAULT_SETTINGS: UserSettings = {
  lastSceneId: null,
  // Conservative default so first launch doesn't blast a sleeping user.
  // Settings has a master slider for those who want more.
  masterVolume: 0.4,
  // Half-volume bed under narration is the starting point — the singing-bowl
  // and story-bed scenes are mixed to sit on their own at the standalone
  // Player altitudes (primary element ~0.55), which drowns a voice track.
  // The slider in ContentPlayerScreen lets the user tune from here.
  contentBedAttenuation: 0.5,
  tinnitus: {
    centerHz: 8000,
    bandwidthHz: 400,
    defaultVolume: 0.2,
    hasCalibrated: false,
  },
  voices: {
    storyVoiceId: 'tide',
    meditationVoiceId: 'hush',
  },
  elevenLabsApiKey: null,
  anthropicApiKey: null,
  displayMode: 'lush',
  defaultTimerMinutes: null,
  layerVolumes: {},
  debugMarkers: false,
  narrationSundown: true,
};

// Cached in-memory copy so per-key reads don't hit localStorage every time.
// Invalidated on any setSetting call.
let cache: UserSettings | null = null;

function read(): UserSettings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = structuredClone(DEFAULT_SETTINGS);
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    // Merge with defaults to cover newly-added settings keys after upgrades.
    cache = mergeWithDefaults(parsed);
    return cache;
  } catch (err) {
    console.warn('[storage/settings] read failed; falling back to defaults', err);
    cache = structuredClone(DEFAULT_SETTINGS);
    return cache;
  }
}

// Debounce the localStorage write. The in-memory cache is updated
// synchronously so reads remain consistent, but the actual persist is
// coalesced — a slider drag firing 60 setSetting calls per second now
// produces one write at the tail of the gesture instead of 60.
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const WRITE_DEBOUNCE_MS = 200;

function flushWrite(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[storage/settings] write failed', err);
  }
}

function write(settings: UserSettings): void {
  cache = settings;
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (cache) flushWrite(cache);
  }, WRITE_DEBOUNCE_MS);
}

// Flush any pending write before the page unloads so we never lose the
// last 200 ms of slider drags. Guarded against non-browser environments
// (e.g. server-side rendering, tests) — typeof check is intentionally cheap.
if (typeof window !== 'undefined') {
  // pagehide is more reliable than beforeunload for PWAs and on iOS Safari
  // (which sometimes skips beforeunload when the app is backgrounded).
  window.addEventListener('pagehide', () => {
    if (writeTimer !== null) {
      clearTimeout(writeTimer);
      writeTimer = null;
      if (cache) flushWrite(cache);
    }
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Fill a stored (possibly older, possibly partial) payload out to a full
 * UserSettings, keeping the defaults for anything missing.
 *
 * This walks the keys of DEFAULT_SETTINGS rather than naming them one by
 * one. The hand-written version silently dropped any key nobody remembered
 * to add — `narrationSundown` shipped that way, so turning Narration
 * Sundown off in Settings was forgotten on the next reload, with no error
 * anywhere to notice. Walking the defaults means a newly added setting
 * persists the day it is added.
 *
 * Values are still type-checked against the default they replace, so a
 * corrupted or hand-edited payload can't put a string where the app expects
 * a number. Nested objects (tinnitus, voices) merge key-by-key so a payload
 * written by an older build keeps the current defaults for keys it lacks.
 */
function mergeWithDefaults(partial: Partial<UserSettings>): UserSettings {
  const out = structuredClone(DEFAULT_SETTINGS);
  const sink = out as unknown as Record<string, unknown>;
  const source = partial as unknown as Record<string, unknown>;
  for (const key of Object.keys(sink)) {
    const stored = source[key];
    if (stored === undefined) continue;
    const fallback = sink[key];

    if (isPlainObject(fallback)) {
      if (isPlainObject(stored)) Object.assign(fallback, stored);
      continue;
    }
    if (fallback === null) {
      // A nullable key (lastSceneId, the API keys, defaultTimerMinutes):
      // null is meaningful, and any primitive is a legitimate stored value.
      if (stored === null || typeof stored !== 'object') sink[key] = stored;
      continue;
    }
    if (typeof stored === typeof fallback) sink[key] = stored;
  }
  return out;
}

export function getSetting<K extends keyof UserSettings>(key: K): UserSettings[K] {
  return read()[key];
}

export function setSetting<K extends keyof UserSettings>(
  key: K,
  value: UserSettings[K]
): void {
  const current = read();
  const next = { ...current, [key]: value };
  write(next);
}

/** The user's saved Mixer levels, keyed by layer id. */
export function getLayerVolumes(): Readonly<Record<string, number>> {
  return read().layerVolumes;
}

/**
 * Remember one layer's Mixer level. Read-modify-write in one place so a
 * caller can't clobber the other layers by rebuilding the map by hand.
 */
export function rememberLayerVolume(layerId: string, volume: number): void {
  const clamped = volume < 0 ? 0 : volume > 1 ? 1 : volume;
  const current = read().layerVolumes;
  if (current[layerId] === clamped) return;
  setSetting('layerVolumes', { ...current, [layerId]: clamped });
}

export function getAllSettings(): UserSettings {
  return structuredClone(read());
}

export function resetSettings(): void {
  cache = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Drop only the in-memory cache so the next read pulls from localStorage
 * fresh. The localStorage payload is left intact — unlike resetSettings,
 * which is a factory reset. Exists for tests that need to simulate a
 * cold-load scenario.
 */
export function __invalidateCacheForTests(): void {
  cache = null;
}
