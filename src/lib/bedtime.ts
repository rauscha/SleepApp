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
