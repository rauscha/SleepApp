import { describe, it, expect } from 'vitest';
import { PRIME_ADJACENT_LOOP_OFFSETS_SECONDS } from './sceneFormat';

// Loop offsets used across a scene MUST be pairwise coprime — otherwise
// the combined pattern repeats faster than the LCM of the individual
// offsets, and a multi-hour sleep session hears the same combination
// recur. This bit silently for hours in an earlier version (253 + 407
// shared gcd 11, LCM only 2.6h).

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

describe('PRIME_ADJACENT_LOOP_OFFSETS_SECONDS', () => {
  it('contains at least 3 values', () => {
    expect(PRIME_ADJACENT_LOOP_OFFSETS_SECONDS.length).toBeGreaterThanOrEqual(3);
  });

  it('is pairwise coprime', () => {
    const offs = PRIME_ADJACENT_LOOP_OFFSETS_SECONDS;
    for (let i = 0; i < offs.length; i++) {
      for (let j = i + 1; j < offs.length; j++) {
        const a = offs[i]!;
        const b = offs[j]!;
        const g = gcd(a, b);
        expect(g, `gcd(${a}, ${b}) should be 1`).toBe(1);
      }
    }
  });

  it('produces an LCM of any pair exceeding 8 hours', () => {
    // 8 hours = 28800 seconds. If any pair's LCM is shorter, an overnight
    // session will hear the pattern repeat.
    const offs = PRIME_ADJACENT_LOOP_OFFSETS_SECONDS;
    const EIGHT_HOURS = 8 * 60 * 60;
    for (let i = 0; i < offs.length; i++) {
      for (let j = i + 1; j < offs.length; j++) {
        const a = offs[i]!;
        const b = offs[j]!;
        const lcm = (a * b) / gcd(a, b);
        expect(lcm, `lcm(${a}, ${b})=${lcm} should exceed 8h`).toBeGreaterThan(EIGHT_HOURS);
      }
    }
  });
});
