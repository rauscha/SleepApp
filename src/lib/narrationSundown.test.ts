import { describe, expect, it } from 'vitest';
import {
  SUNDOWN_FLOOR,
  SUNDOWN_START_FRACTION,
  narrationGain,
} from './narrationSundown';

describe('narrationGain', () => {
  const D = 900; // 15 min story

  it('is full gain through the first two-thirds', () => {
    expect(narrationGain(0, D)).toBe(1);
    expect(narrationGain(D * 0.5, D)).toBe(1);
    expect(narrationGain(D * SUNDOWN_START_FRACTION, D)).toBe(1);
  });

  it('ramps down linearly across the final third', () => {
    const start = D * SUNDOWN_START_FRACTION;
    const mid = (start + D) / 2; // halfway through the final third
    const g = narrationGain(mid, D);
    expect(g).toBeLessThan(1);
    expect(g).toBeCloseTo(1 - 0.5 * (1 - SUNDOWN_FLOOR), 5);
  });

  it('reaches the floor at (and past) the end', () => {
    expect(narrationGain(D, D)).toBe(SUNDOWN_FLOOR);
    expect(narrationGain(D + 100, D)).toBe(SUNDOWN_FLOOR);
  });

  it('is monotonically non-increasing', () => {
    let prev = Infinity;
    for (let p = 0; p <= D; p += D / 50) {
      const g = narrationGain(p, D);
      expect(g).toBeLessThanOrEqual(prev + 1e-9);
      prev = g;
    }
  });

  it('handles a zero/unknown duration as full gain', () => {
    expect(narrationGain(10, 0)).toBe(1);
    expect(narrationGain(10, NaN)).toBe(1);
  });
});
