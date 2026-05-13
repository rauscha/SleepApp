import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SETTINGS,
  __invalidateCacheForTests,
  getAllSettings,
  getSetting,
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
