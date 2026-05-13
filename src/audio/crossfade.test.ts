import { describe, it, expect } from 'vitest';
import { equalPower } from './crossfade';

// Equal-power crossfade math is THE place a silent regression bites the
// hardest — a buggy curve produces an audible dip at the loop seam that
// only shows up after a buffer rotates, which can be minutes apart.

describe('equalPower', () => {
  it('starts at full out / silent in', () => {
    const g = equalPower(0);
    expect(g.out).toBeCloseTo(1, 6);
    expect(g.in).toBeCloseTo(0, 6);
  });

  it('ends at silent out / full in', () => {
    const g = equalPower(1);
    expect(g.out).toBeCloseTo(0, 6);
    expect(g.in).toBeCloseTo(1, 6);
  });

  it('crosses at sqrt(0.5) at the midpoint', () => {
    const g = equalPower(0.5);
    const expected = Math.SQRT1_2; // 0.7071...
    expect(g.out).toBeCloseTo(expected, 6);
    expect(g.in).toBeCloseTo(expected, 6);
  });

  it('keeps combined power equal to 1 across the curve', () => {
    // out^2 + in^2 = 1 is the defining property of equal-power.
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const g = equalPower(t);
      const power = g.out * g.out + g.in * g.in;
      expect(power).toBeCloseTo(1, 6);
    }
  });

  it('clamps inputs outside [0, 1]', () => {
    expect(equalPower(-1).out).toBeCloseTo(1, 6);
    expect(equalPower(-1).in).toBeCloseTo(0, 6);
    expect(equalPower(2).out).toBeCloseTo(0, 6);
    expect(equalPower(2).in).toBeCloseTo(1, 6);
  });
});
