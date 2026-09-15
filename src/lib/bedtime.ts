// The bedtime window, [21:00, 06:00) — inclusive at 9pm, exclusive at 6am.
//
// It once gated a "daytime-only" affordance, the story-generation form, on
// the grounds that typing a theme and waiting five minutes for a paid render
// is executive-function work nobody should be invited into at 11pm. That form
// is gone (the library is hand-made now), and the predicate went with it. The
// hours survive as the clock behind the Tonight greeting.

export const BEDTIME_START_HOUR = 21;
export const BEDTIME_END_HOUR = 6;

/**
 * The Tonight subtitle, swapped by hour so the app greets the actual moment
 * (roadmap 6.4). Editorial, warm, never chirpy — the reader is winding down.
 */
export function tonightGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= BEDTIME_START_HOUR) {
    // 21:00–23:59
    return 'The day is winding down. Choose something to fall into.';
  }
  if (h < 4) {
    // 00:00–03:59 — the small hours
    return 'Awake in the small hours. Let’s get you back under.';
  }
  if (h < BEDTIME_END_HOUR) {
    // 04:00–05:59
    return 'Almost morning. Rest while it lasts.';
  }
  // 06:00–20:59
  return 'A place to land at the end of the day.';
}
