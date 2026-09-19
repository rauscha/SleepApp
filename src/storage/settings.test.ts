import { describe, it, expect, beforeEach } from 'vitest';
import type { UserSettings } from './types';
import {
  DEFAULT_SETTINGS,
  __invalidateCacheForTests,
  getAllSettings,
  forgetLayerVolumes,
  getLayerVolumes,
  getSetting,
  rememberLayerVolume,
  resetSettings,
  setSetting,
} from './settings';

// jsdom gives us a working localStorage shim. We reset between tests so
// state doesn't leak.

describe('settings storage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSettings();
  });

  it('returns defaults when storage is empty', () => {
    const s = getAllSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('persists a setSetting across getAllSettings calls', () => {
    setSetting('masterVolume', 0.42);
    expect(getSetting('masterVolume')).toBe(0.42);
    expect(getAllSettings().masterVolume).toBe(0.42);
  });

  it('does not mutate the cached object when callers mutate the returned copy', () => {
    const a = getAllSettings();
    a.masterVolume = 0.99;
    const b = getAllSettings();
    // getAllSettings returns a structured clone, so mutating `a` MUST NOT
    // bleed into `b`.
    expect(b.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
  });

  it('merges defaults into a partial stored payload', () => {
    // Simulate a stored payload from an earlier app version that lacks
    // some fields. After a read, the missing fields should fall back to
    // the current defaults rather than being undefined.
    localStorage.setItem(
      'sleep-app:settings:v1',
      JSON.stringify({ masterVolume: 0.5 })
    );
    __invalidateCacheForTests();
    const s = getAllSettings();
    expect(s.masterVolume).toBe(0.5);
    expect(s.displayMode).toBe(DEFAULT_SETTINGS.displayMode);
    expect(s.tinnitus.centerHz).toBe(DEFAULT_SETTINGS.tinnitus.centerHz);
  });

  it('survives a corrupt stored payload', () => {
    localStorage.setItem('sleep-app:settings:v1', '{ this is not json');
    __invalidateCacheForTests();
    const s = getAllSettings();
    // Defaults restored — better than crashing the app at 3 a.m.
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('resetSettings clears localStorage and reverts cache', () => {
    setSetting('masterVolume', 0.1);
    resetSettings();
    expect(getAllSettings().masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    expect(localStorage.getItem('sleep-app:settings:v1')).toBeNull();
  });
});

describe('keepScreenAwake', () => {
  beforeEach(() => {
    localStorage.clear();
    __invalidateCacheForTests();
  });

  // The default is the whole point of this setting. It shipped as an
  // ungated always-on wake lock for three months, holding the screen awake
  // all night, and the engine pivot that removed its reason to exist landed
  // in June. If this ever flips back to true by accident, the app goes back
  // to burning a lit screen until morning for no playback benefit.
  it('defaults to OFF', () => {
    expect(DEFAULT_SETTINGS.keepScreenAwake).toBe(false);
    expect(getSetting('keepScreenAwake')).toBe(false);
  });

  it('round-trips when the user turns it on', () => {
    // Note: writes are debounced, so don't invalidate the cache here
    // expecting to read it back out of localStorage — that flush has not
    // happened yet. The persistence path is covered by the merge test below.
    setSetting('keepScreenAwake', true);
    expect(getSetting('keepScreenAwake')).toBe(true);
    setSetting('keepScreenAwake', false);
    expect(getSetting('keepScreenAwake')).toBe(false);
  });

  it('survives a stored blob written before the key existed', () => {
    // An install from before this setting shipped has no such key; the
    // merge must supply the safe default rather than undefined.
    localStorage.setItem(
      'sleep-app:settings:v1',
      JSON.stringify({ masterVolume: 0.3 })
    );
    __invalidateCacheForTests();
    expect(getSetting('keepScreenAwake')).toBe(false);
    expect(getSetting('masterVolume')).toBe(0.3);
  });

  it('reads back an explicitly stored true', () => {
    localStorage.setItem(
      'sleep-app:settings:v1',
      JSON.stringify({ keepScreenAwake: true })
    );
    __invalidateCacheForTests();
    expect(getSetting('keepScreenAwake')).toBe(true);
  });
});

describe('settings merge covers every key', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSettings();
  });


  // The merge used to name each key by hand and silently dropped any it
  // forgot — narrationSundown shipped that way, so turning it off was
  // forgotten on the next reload. This walks DEFAULT_SETTINGS so a newly
  // added setting cannot repeat that.
  const NON_DEFAULT: Partial<Record<keyof UserSettings, unknown>> = {
    lastSceneId: 'forest-night',
    masterVolume: 0.77,
    contentBedAttenuation: 0.25,
    tinnitus: {
      centerHz: 9000,
      bandwidthHz: 500,
      defaultVolume: 0.4,
      hasCalibrated: true,
    },
    voices: { storyVoiceId: 'stone', meditationVoiceId: 'glen' },
    keepScreenAwake: true,
    displayMode: 'nightstand',
    defaultTimerMinutes: 90,
    narrationSundown: false,
    debugMarkers: true,
    layerVolumes: { 'forest-night:wind-in-leaves': 0.62 },
  };

  it('has a differing test value for every setting', () => {
    // Guards the guard: a key added to UserSettings without a case here
    // would otherwise pass the round-trip test vacuously.
    expect(Object.keys(NON_DEFAULT).sort()).toEqual(
      Object.keys(DEFAULT_SETTINGS).sort()
    );
    for (const [key, value] of Object.entries(NON_DEFAULT)) {
      expect(value).not.toEqual(
        DEFAULT_SETTINGS[key as keyof UserSettings]
      );
    }
  });

  it('round-trips every key through a cold reload', () => {
    for (const [key, value] of Object.entries(NON_DEFAULT)) {
      setSetting(key as keyof UserSettings, value as never);
    }
    // Writes are debounced by 200 ms; pagehide is the real flush path a
    // backgrounded PWA takes, so use it rather than waiting on a timer.
    window.dispatchEvent(new Event('pagehide'));
    __invalidateCacheForTests();

    const loaded = getAllSettings();
    for (const [key, value] of Object.entries(NON_DEFAULT)) {
      expect({ [key]: loaded[key as keyof UserSettings] }).toEqual({
        [key]: value,
      });
    }
  });

  it('keeps the default for a key the stored payload lacks', () => {
    localStorage.setItem(
      'sleep-app:settings:v1',
      JSON.stringify({ masterVolume: 0.9 })
    );
    __invalidateCacheForTests();
    const loaded = getAllSettings();
    expect(loaded.masterVolume).toBe(0.9);
    expect(loaded.narrationSundown).toBe(DEFAULT_SETTINGS.narrationSundown);
    expect(loaded.defaultTimerMinutes).toBe(DEFAULT_SETTINGS.defaultTimerMinutes);
  });

  it('rejects a stored value of the wrong type', () => {
    localStorage.setItem(
      'sleep-app:settings:v1',
      JSON.stringify({ masterVolume: 'loud', narrationSundown: 'yes' })
    );
    __invalidateCacheForTests();
    const loaded = getAllSettings();
    expect(loaded.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    expect(loaded.narrationSundown).toBe(DEFAULT_SETTINGS.narrationSundown);
  });

  it('merges a nested object key-by-key', () => {
    localStorage.setItem(
      'sleep-app:settings:v1',
      JSON.stringify({ tinnitus: { centerHz: 10_000 } })
    );
    __invalidateCacheForTests();
    const loaded = getAllSettings();
    expect(loaded.tinnitus.centerHz).toBe(10_000);
    expect(loaded.tinnitus.bandwidthHz).toBe(DEFAULT_SETTINGS.tinnitus.bandwidthHz);
  });
});

describe('remembered Mixer levels', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSettings();
  });

  it('starts empty and records a level per layer', () => {
    expect(getLayerVolumes()).toEqual({});
    rememberLayerVolume('forest-night:wind-in-leaves', 0.62);
    rememberLayerVolume('forest-night:synth-bed', 0.08);
    expect(getLayerVolumes()).toEqual({
      'forest-night:wind-in-leaves': 0.62,
      'forest-night:synth-bed': 0.08,
    });
  });

  it('updates one layer without clobbering the others', () => {
    rememberLayerVolume('a:one', 0.4);
    rememberLayerVolume('a:two', 0.9);
    rememberLayerVolume('a:one', 0.1);
    expect(getLayerVolumes()).toEqual({ 'a:one': 0.1, 'a:two': 0.9 });
  });

  it('clamps out-of-range values', () => {
    rememberLayerVolume('a:one', 4);
    rememberLayerVolume('a:two', -1);
    expect(getLayerVolumes()).toEqual({ 'a:one': 1, 'a:two': 0 });
  });

  it('forgets one scene without touching the others', () => {
    rememberLayerVolume('forest-night:wind-in-leaves', 0.5);
    rememberLayerVolume('forest-night:synth-bed', 0.08);
    rememberLayerVolume('forest-day:wind-in-leaves', 0.4);

    forgetLayerVolumes('forest-night');

    expect(getLayerVolumes()).toEqual({ 'forest-day:wind-in-leaves': 0.4 });
  });

  it('is a no-op for a scene with nothing saved', () => {
    rememberLayerVolume('forest-day:wind-in-leaves', 0.4);
    forgetLayerVolumes('ocean-night');
    expect(getLayerVolumes()).toEqual({ 'forest-day:wind-in-leaves': 0.4 });
  });

  it('does not match a scene whose id is a prefix of another', () => {
    // 'forest' must not take 'forest-night' with it.
    rememberLayerVolume('forest-night:wind-in-leaves', 0.5);
    forgetLayerVolumes('forest');
    expect(getLayerVolumes()).toEqual({ 'forest-night:wind-in-leaves': 0.5 });
  });

  it('survives a cold reload', () => {
    rememberLayerVolume('forest-night:synth-bed', 0.08);
    window.dispatchEvent(new Event('pagehide'));
    __invalidateCacheForTests();
    expect(getLayerVolumes()['forest-night:synth-bed']).toBe(0.08);
  });
});
