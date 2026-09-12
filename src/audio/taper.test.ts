import { describe, it, expect } from 'vitest';
import { gainToTaper, taperToGain, TAPER_RANGE_DB } from './taper';

const dbBetween = (a: number, b: number) => 20 * Math.log10(a / b);

describe('slider taper', () => {
  it('puts silence at the bottom and the ceiling at the top', () => {
    expect(taperToGain(0, 0.6)).toBe(0);
    expect(taperToGain(1, 0.6)).toBe(0.6);
    expect(taperToGain(0, 1)).toBe(0);
    expect(taperToGain(1, 1)).toBe(1);
  });

  it('spends equal travel on equal loudness change', () => {
    // The whole point. Each tenth of the travel is the same number of dB,
    // which is what a linear-amplitude slider fails to do.
    const step = TAPER_RANGE_DB / 10;
    for (let i = 2; i < 10; i++) {
      const hi = taperToGain(i / 10);
      const lo = taperToGain((i - 1) / 10);
      expect(dbBetween(hi, lo)).toBeCloseTo(step, 4);
    }
  });

  it('gives the top half of the slider real range, unlike linear', () => {
    // Linear amplitude spends only 6 dB on the entire top half.
    const linearTopHalfDb = dbBetween(1, 0.5);
    const taperTopHalfDb = dbBetween(taperToGain(1), taperToGain(0.5));
    expect(linearTopHalfDb).toBeCloseTo(6.02, 1);
    expect(taperTopHalfDb).toBeCloseTo(TAPER_RANGE_DB / 2, 4);
    expect(taperTopHalfDb).toBeGreaterThan(linearTopHalfDb * 2);
  });

  it('is monotonic across the whole travel', () => {
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const g = taperToGain(i / 100, 0.6);
      expect(g).toBeGreaterThanOrEqual(previous);
      previous = g;
    }
  });

  it('round-trips a gain back to the same slider position', () => {
    for (const max of [1, 0.6, 0.32]) {
      for (const travel of [0, 0.01, 0.05, 0.2, 0.5, 0.799, 0.9, 1]) {
        const gain = taperToGain(travel, max);
        expect(gainToTaper(gain, max)).toBeCloseTo(travel, 6);
      }
    }
  });

  it('never exceeds the ceiling', () => {
    expect(taperToGain(1.5, 0.6)).toBe(0.6);
    expect(taperToGain(0.9, 0.6)).toBeLessThan(0.6);
  });

  it('clamps nonsense input rather than producing NaN', () => {
    expect(taperToGain(-1, 0.6)).toBe(0);
    expect(taperToGain(0.5, 0)).toBe(0);
    expect(gainToTaper(-1, 0.6)).toBe(0);
    expect(gainToTaper(5, 0.6)).toBe(1);
    expect(gainToTaper(0.3, 0)).toBe(0);
  });

  it('places a level voiced at half its ceiling high on the slider', () => {
    // Scene defaults sit at half their ceiling (the 2x rule), so this is
    // where the thumb starts on most layers: most of the travel is below it,
    // which is the direction a sleeper actually reaches for.
    const travel = gainToTaper(0.5, 1);
    expect(travel).toBeGreaterThan(0.75);
    expect(travel).toBeLessThan(0.85);
  });

  it('reaches true silence by dragging to the bottom', () => {
    // A pure dB curve never gets there; the bottom of the travel has to.
    expect(taperToGain(0.02, 0.6)).toBeGreaterThan(0);
    expect(taperToGain(0.02, 0.6)).toBeLessThan(taperToGain(0.05, 0.6));
    expect(taperToGain(0, 0.6)).toBe(0);
  });
});
