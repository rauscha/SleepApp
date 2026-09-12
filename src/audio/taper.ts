// Slider taper — the mapping between where a volume slider sits and the
// gain it produces.
//
// Why this is not just `gain = travel`: gain is linear amplitude, and
// loudness is not. Doubling amplitude is +6 dB, which is well under a
// doubling of perceived loudness, so on a linear slider the entire top half
// covers barely any audible change while the bottom few percent covers an
// enormous amount. That is the "there's no way I'd ever go past 60%" feel —
// the useful range is crushed into one end.
//
// The fix is the taper every real mixing desk uses: constant dB per unit of
// travel. Equal movements of the thumb are then equal changes in loudness,
// anywhere on the slider, which is the most controllable arrangement and the
// only one that deserves the word "perceptual".
//
// This module is pure and invertible on purpose: the engine stores real gain
// (so scene JSON, saved Mixer levels and the marker log all keep meaning
// exactly what they meant before), and the taper exists only to convert at
// the edge where a slider is drawn or dragged.

/**
 * Travel-to-silence range, in decibels. 30 dB is a wide useful span for
 * quiet ambient beds — a whisper below the top — while keeping the whole
 * slider live. Larger ranges push the default so high on the slider that
 * there is nothing left above it.
 */
export const TAPER_RANGE_DB = 30;

/**
 * Fraction of travel at the bottom that fades the curve's floor down to
 * true silence.
 *
 * A pure dB curve never reaches zero, so without this the first pixel of
 * travel would jump straight to the floor level and "off" would not be
 * reachable by dragging. A layer slid to the bottom must be silent.
 */
const SILENCE_BLEND = 0.05;

/** Gain (as a fraction of max) the dB curve reaches at SILENCE_BLEND. */
const BLEND_GAIN = 10 ** (((SILENCE_BLEND - 1) * TAPER_RANGE_DB) / 20);

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Slider position (0-1 of travel) to real gain.
 *
 * @param travel Where the thumb sits, 0 at the bottom and 1 at the top.
 * @param max This slider's ceiling — the gain at full travel. See
 *   SceneElementDefinition.maxVolume.
 */
export function taperToGain(travel: number, max = 1): number {
  const ceiling = clamp01(max);
  const t = clamp01(travel);
  if (t <= 0 || ceiling <= 0) return 0;
  if (t >= 1) return ceiling;
  if (t < SILENCE_BLEND) {
    // Linear run-in to silence so the bottom of the slider is really off.
    return ceiling * BLEND_GAIN * (t / SILENCE_BLEND);
  }
  return ceiling * 10 ** (((t - 1) * TAPER_RANGE_DB) / 20);
}

/**
 * Real gain back to slider position — the exact inverse of taperToGain, so
 * a slider drawn from a stored gain lands where the user left it.
 */
export function gainToTaper(gain: number, max = 1): number {
  const ceiling = clamp01(max);
  if (ceiling <= 0) return 0;
  const g = clamp01(gain) / ceiling;
  if (g <= 0) return 0;
  if (g >= 1) return 1;
  if (g < BLEND_GAIN) return SILENCE_BLEND * (g / BLEND_GAIN);
  return clamp01(1 + (20 * Math.log10(g)) / TAPER_RANGE_DB);
}
