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

function mergeWithDefaults(partial: Partial<UserSettings>): UserSettings {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (partial.lastSceneId !== undefined) out.lastSceneId = partial.lastSceneId;
  if (typeof partial.masterVolume === 'number') out.masterVolume = partial.masterVolume;
  if (typeof partial.contentBedAttenuation === 'number') {
    out.contentBedAttenuation = partial.contentBedAttenuation;
  }
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

/**
 * Drop only the in-memory cache so the next read pulls from localStorage
 * fresh. The localStorage payload is left intact — unlike resetSettings,
 * which is a factory reset. Exists for tests that need to simulate a
 * cold-load scenario.
 */
export function __invalidateCacheForTests(): void {
  cache = null;
}
