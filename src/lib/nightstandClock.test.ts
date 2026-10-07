import { describe, expect, it } from 'vitest';
import {
  formatNightstandClock,
  msUntilNextMinute,
  nightstandClockDrift,
} from './nightstandClock';

describe('formatNightstandClock', () => {
  const lateNight = new Date(2026, 9, 5, 3, 7, 42);
  const afternoon = new Date(2026, 9, 5, 15, 7, 0);

  it('shows hour and minute with no AM/PM in a 12-hour locale', () => {
    expect(formatNightstandClock(lateNight, 'en-US')).toBe('3:07');
    expect(formatNightstandClock(afternoon, 'en-US')).toBe('3:07');
  });

  it('keeps a 24-hour locale on its own clock', () => {
    expect(formatNightstandClock(lateNight, 'en-GB')).toBe('3:07');
    expect(formatNightstandClock(afternoon, 'en-GB')).toBe('15:07');
  });
});

describe('nightstandClockDrift', () => {
  it('stays within a few pixels and moves from one minute to the next', () => {
    const seen = new Set<string>();
    for (let m = 0; m < 60; m++) {
      const { x, y } = nightstandClockDrift(new Date(2026, 9, 5, 3, m));
      expect(Math.abs(x)).toBeLessThanOrEqual(6);
      expect(Math.abs(y)).toBeLessThanOrEqual(2);
      seen.add(`${x},${y}`);
    }
    expect(seen.size).toBe(15);
    expect(nightstandClockDrift(new Date(2026, 9, 5, 3, 7))).not.toEqual(
      nightstandClockDrift(new Date(2026, 9, 5, 3, 8)),
    );
  });
});

describe('msUntilNextMinute', () => {
  it('counts to the top of the next minute', () => {
    expect(msUntilNextMinute(new Date(2026, 9, 5, 3, 7, 42, 500))).toBe(17_500);
    expect(msUntilNextMinute(new Date(2026, 9, 5, 3, 7, 0, 0))).toBe(60_000);
  });
});
