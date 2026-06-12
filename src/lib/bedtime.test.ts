import { describe, expect, it } from 'vitest';
import {
  BEDTIME_END_HOUR,
  BEDTIME_START_HOUR,
  isBedtime,
  tonightGreeting,
} from './bedtime';

function at(hour: number, minute = 0): Date {
  const d = new Date(2026, 0, 1, hour, minute, 0, 0);
  return d;
}

describe('isBedtime', () => {
  it('is true at and after the start hour', () => {
    expect(isBedtime(at(BEDTIME_START_HOUR))).toBe(true);
    expect(isBedtime(at(BEDTIME_START_HOUR, 30))).toBe(true);
    expect(isBedtime(at(23, 59))).toBe(true);
  });

  it('is true through the small hours up to (but not including) the end hour', () => {
    expect(isBedtime(at(0))).toBe(true);
    expect(isBedtime(at(2, 30))).toBe(true);
    expect(isBedtime(at(BEDTIME_END_HOUR - 1, 59))).toBe(true);
  });

  it('flips to false at exactly the end hour', () => {
    expect(isBedtime(at(BEDTIME_END_HOUR))).toBe(false);
    expect(isBedtime(at(BEDTIME_END_HOUR, 1))).toBe(false);
  });

  it('is false through the daytime', () => {
    expect(isBedtime(at(9))).toBe(false);
    expect(isBedtime(at(12))).toBe(false);
    expect(isBedtime(at(BEDTIME_START_HOUR - 1, 59))).toBe(false);
  });

  it('defaults to the current time when no Date is provided', () => {
    expect(() => isBedtime()).not.toThrow();
    expect(typeof isBedtime()).toBe('boolean');
  });
});

describe('tonightGreeting', () => {
  it('greets the late evening (21:00–23:59)', () => {
    const g = tonightGreeting(at(22));
    expect(g).toBe(tonightGreeting(at(BEDTIME_START_HOUR)));
    expect(g).toMatch(/winding down/i);
  });

  it('greets the small hours (00:00–03:59)', () => {
    expect(tonightGreeting(at(2, 30))).toMatch(/small hours/i);
    expect(tonightGreeting(at(0))).toBe(tonightGreeting(at(3, 59)));
  });

  it('greets the early morning (04:00–05:59)', () => {
    expect(tonightGreeting(at(5))).toMatch(/almost morning/i);
    expect(tonightGreeting(at(BEDTIME_END_HOUR - 1, 59))).toMatch(/morning/i);
  });

  it('uses the daytime greeting from 06:00 to 20:59', () => {
    expect(tonightGreeting(at(BEDTIME_END_HOUR))).toMatch(/end of the day/i);
    expect(tonightGreeting(at(12))).toBe(tonightGreeting(at(BEDTIME_START_HOUR - 1, 59)));
  });

  it('the four phases are distinct copy', () => {
    const phrases = new Set([
      tonightGreeting(at(22)),
      tonightGreeting(at(2)),
      tonightGreeting(at(5)),
      tonightGreeting(at(12)),
    ]);
    expect(phrases.size).toBe(4);
  });
});
