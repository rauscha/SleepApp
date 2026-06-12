import { describe, expect, it } from 'vitest';
import {
  DEEP_NIGHT_END_HOUR,
  DEEP_NIGHT_FADE_TARGET,
  DEEP_NIGHT_FIRST_FADE_SECONDS,
  DEEP_NIGHT_START_HOUR,
  deepNightResumeParams,
  isDeepNight,
} from './deepNight';

function at(hour: number, minute = 0): Date {
  return new Date(2026, 0, 1, hour, minute, 0, 0);
}

describe('isDeepNight', () => {
  it('is true through the deep-night window [01:00, 05:00)', () => {
    expect(isDeepNight(at(DEEP_NIGHT_START_HOUR))).toBe(true);
    expect(isDeepNight(at(3))).toBe(true);
    expect(isDeepNight(at(DEEP_NIGHT_END_HOUR - 1, 59))).toBe(true);
  });

  it('is false at the boundaries and outside the window', () => {
    expect(isDeepNight(at(DEEP_NIGHT_START_HOUR - 1, 59))).toBe(false); // 00:59
    expect(isDeepNight(at(DEEP_NIGHT_END_HOUR))).toBe(false); // 05:00
    expect(isDeepNight(at(12))).toBe(false);
    expect(isDeepNight(at(22))).toBe(false); // late evening, not deep night
  });

  it('defaults to now without throwing', () => {
    expect(typeof isDeepNight()).toBe('boolean');
  });
});

describe('deepNightResumeParams', () => {
  it('resumes on a long fade up to a reduced scene gain', () => {
    const p = deepNightResumeParams();
    expect(p.firstFadeSeconds).toBe(DEEP_NIGHT_FIRST_FADE_SECONDS);
    expect(p.firstFadeSeconds).toBeGreaterThanOrEqual(30);
    expect(p.firstFadeTarget).toBe(DEEP_NIGHT_FADE_TARGET);
    expect(p.firstFadeTarget).toBeGreaterThan(0);
    expect(p.firstFadeTarget).toBeLessThan(1); // quieter than a daytime start
  });
});
