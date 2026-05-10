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
  masterVolume: 0.7,
  tinnitus: {
    centerHz: 8000,
    bandwidthHz: 400,
    defaultVolume: 0.2,
    hasCalibrated: false,
  },
  voices: {
    storyVoiceId: 'hush',
    meditationVoiceId: 'tide',
  },
  elevenLabsApiKey: null,
  anthropicApiKey: null,
  displayMode: 'lush',
  defaultTimerMinutes: null,
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

function write(settings: UserSettings): void {
  cache = settings;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[storage/settings] write failed', err);
  }
}

function mergeWithDefaults(partial: Partial<UserSettings>): UserSettings {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (partial.lastSceneId !== undefined) out.lastSceneId = partial.lastSceneId;
  if (typeof partial.masterVolume === 'number') out.masterVolume = partial.masterVolume;
  if (partial.tinnitus) Object.assign(out.tinnitus, partial.tinnitus);
  if (partial.voices) Object.assign(out.voices, partial.voices);
  if (partial.elevenLabsApiKey !== undefined) out.elevenLabsApiKey = partial.elevenLabsApiKey;
  if (partial.anthropicApiKey !== undefined) out.anthropicApiKey = partial.anthropicApiKey;
  if (partial.displayMode) out.displayMode = partial.displayMode;
  if (partial.defaultTimerMinutes !== undefined) {
    out.defaultTimerMinutes = partial.defaultTimerMinutes;
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
