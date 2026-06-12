// Narration Sundown (roadmap 6.3) — the gain ramp that submerges a story's
// narration under its paired scene bed over the final third.
//
// A story that ends on a hard stop is a state change, and a state change is
// a wake event. Instead, the voice rides a slow ramp down across the last
// third of its duration so it dissolves into the bed (which plays on all
// night) rather than snapping off. The bundled stories already "end
// mid-sentence" by design; this finishes the effect at the audio level.

/** Fraction of the story at which the voice begins to submerge. */
export const SUNDOWN_START_FRACTION = 2 / 3;
/** Floor the voice ramps down to by the end (0 = fully submerged). */
export const SUNDOWN_FLOOR = 0;

/**
 * Narration gain multiplier in [SUNDOWN_FLOOR, 1] for a given playback
 * position. Full gain through the first two-thirds, then a linear ramp down
 * to the floor across the final third. Pure + exported for unit testing.
 */
export function narrationGain(
  positionSeconds: number,
  durationSeconds: number
): number {
  if (!(durationSeconds > 0)) return 1;
  const rampStart = durationSeconds * SUNDOWN_START_FRACTION;
  if (positionSeconds <= rampStart) return 1;
  if (positionSeconds >= durationSeconds) return SUNDOWN_FLOOR;
  const progress = (positionSeconds - rampStart) / (durationSeconds - rampStart);
  return 1 - progress * (1 - SUNDOWN_FLOOR);
}
