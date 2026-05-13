import { describe, it, expect } from 'vitest';
import { ToneMatcher } from './ToneMatcher';

// Slider <-> Hz mapping must round-trip exactly so a saved setting
// reopens at the same slider position. Logarithmic, 2k-12k.

describe('ToneMatcher slider mapping', () => {
  it('maps slider 0 to 2 kHz', () => {
    expect(ToneMatcher.sliderToHz(0)).toBeCloseTo(2000, 1);
  });

  it('maps slider 1 to 12 kHz', () => {
    expect(ToneMatcher.sliderToHz(1)).toBeCloseTo(12000, 1);
  });

  it('round-trips Hz -> slider -> Hz', () => {
    for (const hz of [2000, 2500, 4000, 6000, 8000, 10000, 12000]) {
      const t = ToneMatcher.hzToSlider(hz);
      const back = ToneMatcher.sliderToHz(t);
      expect(back).toBeCloseTo(hz, 1);
    }
  });

  it('round-trips slider -> Hz -> slider', () => {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const hz = ToneMatcher.sliderToHz(t);
      const back = ToneMatcher.hzToSlider(hz);
      expect(back).toBeCloseTo(t, 6);
    }
  });

  it('clamps out-of-range slider input', () => {
    expect(ToneMatcher.sliderToHz(-1)).toBeCloseTo(2000, 1);
    expect(ToneMatcher.sliderToHz(2)).toBeCloseTo(12000, 1);
  });

  it('clamps out-of-range Hz input', () => {
    expect(ToneMatcher.hzToSlider(500)).toBe(0);
    expect(ToneMatcher.hzToSlider(50000)).toBe(1);
  });

  it('is logarithmic — equal slider deltas give equal pitch ratios', () => {
    // A slider step from 0.2->0.4 should produce the same ratio as 0.6->0.8.
    const a1 = ToneMatcher.sliderToHz(0.2);
    const a2 = ToneMatcher.sliderToHz(0.4);
    const b1 = ToneMatcher.sliderToHz(0.6);
    const b2 = ToneMatcher.sliderToHz(0.8);
    expect(a2 / a1).toBeCloseTo(b2 / b1, 4);
  });
});
