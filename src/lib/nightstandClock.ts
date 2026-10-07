// The dim clock Nightstand draws in place of Android's status bar.
//
// The installed app runs in the manifest's `fullscreen` display mode, which
// hides the status bar. Andrew used that bar to tell Nightstand's black
// screen from a phone that is really off, but at full white it was too
// bright (2026-10-05). The app can't dim the system's icons, so it draws
// its own cue at a brightness it controls.

/** `3:07`, or `15:07` in a 24-hour locale — the hour and minute in the
 *  locale's own clock, with no AM/PM, the way the status bar shows it. */
export function formatNightstandClock(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })
    .formatToParts(date)
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim();
}

/** A few pixels of slow drift, stepping once a minute, so a clock left on
 *  an OLED panel all night (with "keep screen awake" on) never burns in. */
export function nightstandClockDrift(date: Date): { x: number; y: number } {
  const m = date.getMinutes();
  return { x: ((m % 5) - 2) * 3, y: ((Math.floor(m / 5) % 3) - 1) * 2 };
}

/** Milliseconds until the next minute begins, for a timer that ticks on it. */
export function msUntilNextMinute(date: Date): number {
  return 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds());
}
