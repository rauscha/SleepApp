// The 3 a.m. Door (roadmap 6.1) — the deep-night window and the params for
// resuming the last scene gently.
//
// "Put me to sleep" is well served; "let me stay there" had no affordance
// for the half-asleep, photophobic user who surfaces at 3am to a full
// unlock → bright Tonight → scene tap → 8s fade. In the deep-night window,
// opening the app (with nothing playing) instead offers a single near-black
// panel: one line, one tap, resume the last scene softly.

/** Inclusive start / exclusive end of the deep-night window, local hours.
 *  01:00–04:59 — the groggy small hours when a wake is least wanted and a
 *  bright screen does the most harm. A subset of the bedtime window. */
export const DEEP_NIGHT_START_HOUR = 1;
export const DEEP_NIGHT_END_HOUR = 5;

export function isDeepNight(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h >= DEEP_NIGHT_START_HOUR && h < DEEP_NIGHT_END_HOUR;
}

/** A long first fade so the scene seeps back in rather than snapping on. */
export const DEEP_NIGHT_FIRST_FADE_SECONDS = 30;
/** Scene-gain target for the resume — quieter than a daytime start so a
 *  3am ear isn't jolted. Applied to the scene's own gain (not master), so
 *  the Player's master-volume restore can't undo it. */
export const DEEP_NIGHT_FADE_TARGET = 0.6;

export interface DeepNightResumeParams {
  firstFadeSeconds: number;
  firstFadeTarget: number;
}

/** startScene() options for a deep-night resume: a 30s fade up to a reduced
 *  scene gain. Pure + exported so the values are unit-testable. */
export function deepNightResumeParams(): DeepNightResumeParams {
  return {
    firstFadeSeconds: DEEP_NIGHT_FIRST_FADE_SECONDS,
    firstFadeTarget: DEEP_NIGHT_FADE_TARGET,
  };
}
