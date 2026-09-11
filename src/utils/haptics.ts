// A single short buzz, used to confirm an action the user can't see.
//
// The debug-marker button is tapped in Nightstand mode — a black screen,
// eyes half shut. Flashing anything bright to confirm it would defeat the
// screen's whole purpose, so the confirmation is haptic first and a dim
// line of text second.
//
// navigator.vibrate is Android-only (iOS Safari has never shipped it) and
// is a no-op when the device is in a mode that suppresses it. Both are
// fine: this is confirmation, never the only feedback.

/** Duration of the confirmation buzz. Short enough not to be a jolt. */
const TAP_MS = 40;

export function tapFeedback(durationMs: number = TAP_MS): boolean {
  if (typeof navigator === 'undefined') return false;
  const vibrate = (navigator as Navigator & { vibrate?: (p: number) => boolean })
    .vibrate;
  if (typeof vibrate !== 'function') return false;
  try {
    return vibrate.call(navigator, durationMs);
  } catch {
    return false;
  }
}
