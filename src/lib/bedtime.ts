// Bedtime window — used to gate "daytime-only" UI affordances such as
// the story-generation form. The brief calls out story generation as
// executive-function work (type a theme, wait 2–5 min, pay ~$1–3) that
// shouldn't be invited at 11pm; browsing already-generated stories
// stays open at any hour.
//
// Window: [21:00, 06:00). Inclusive at 9pm, exclusive at 6am, so the
// CTA re-enables exactly at the top of the 6 o'clock hour.

export const BEDTIME_START_HOUR = 21;
export const BEDTIME_END_HOUR = 6;

export function isBedtime(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h >= BEDTIME_START_HOUR || h < BEDTIME_END_HOUR;
}

/**
 * The Tonight subtitle, swapped by hour so the app greets the actual moment
 * (roadmap 6.4). isBedtime() was already built + tested and used only to
 * disable a button; this gives the same clock its voice. Editorial, warm,
 * never chirpy — the reader is winding down.
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
