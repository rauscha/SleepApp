// SleepTimer — the sleep timer's state machine, owned by the playback
// session (SceneCoordinator), not by any screen.
//
// Why this lives here and not in PlayerScreen (review bugs H1 + H3):
//   - H3: when the timer was component-local, leaving the Player threw the
//     countdown away — a confirmed "Stops in 59:32" silently evaporated and
//     the scene played at full volume all night.
//   - H1: the 90s fade-exit timeout was never cleared on unmount, so a
//     timer that fired just as the user left could, 90s later, stop a
//     brand-new scene B they'd started in the meantime.
//
// Keyed to the session: starting (or crossfading to) a scene resets this
// timer, so a pending fade-exit can never fire on a later scene. The Player
// only renders getState()/getRemainingMs() and issues start/cancel.
//
// Basis is wall-clock Date.now() (accepted as-is per review finding L5): a
// backgrounded tab throttles the tick interval, but each tick recomputes
// against the wall clock, so the fade still begins at the right moment.

/** Fade-to-silence duration when the timer fires (brief §; matches the
 *  "90s fade. Walk away." copy on the Player). */
export const SLEEP_TIMER_FADE_SECONDS = 90;

/** How often the running timer re-checks the wall clock. */
const TICK_MS = 500;

/** Slack after the fade completes before the scene is actually stopped, so
 *  the gain ramp reaches true silence first. */
const FADE_EXIT_BUFFER_MS = 600;

export type SleepTimerStatus = 'off' | 'running' | 'fading';

export interface SleepTimerState {
  status: SleepTimerStatus;
  /** Wall-clock ms when the fade begins. Only meaningful while running. */
  endsAt: number | null;
}

export interface SleepTimerHooks {
  /** Begin the audible fade-to-silence over `seconds`. */
  fade: (seconds: number) => void;
  /** Stop the scene — invoked once the fade has completed. */
  stop: () => void;
  /** Cancel an in-progress fade, restoring master gain to `volume`. */
  cancelFade: (volume: number) => void;
}

export class SleepTimer {
  private status: SleepTimerStatus = 'off';
  private endsAt: number | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private fadeExit: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly hooks: SleepTimerHooks) {}

  getState(): SleepTimerState {
    return { status: this.status, endsAt: this.endsAt };
  }

  /** Remaining ms until the fade begins; 0 once fading or off. */
  getRemainingMs(): number {
    if (this.status !== 'running' || this.endsAt === null) return 0;
    return Math.max(0, this.endsAt - Date.now());
  }

  /** Subscribe to state changes (each tick + every transition). Returns an
   *  unsubscribe. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Arm (or re-arm) the timer for `minutes` from now. */
  start(minutes: number): void {
    this.clearTimers();
    this.status = 'running';
    this.endsAt = Date.now() + minutes * 60_000;
    this.tick = setInterval(() => this.check(), TICK_MS);
    this.emit();
  }

  /**
   * User-initiated cancel. Clears the timer and, if a fade was already in
   * progress, restores master gain to `volume`.
   */
  cancel(volume: number): void {
    const wasFading = this.status === 'fading';
    this.clearTimers();
    this.status = 'off';
    this.endsAt = null;
    if (wasFading) this.hooks.cancelFade(volume);
    this.emit();
  }

  /**
   * Drop the timer with NO effect on the audio. Used when the playback
   * session itself begins/ends/changes: the new session must not inherit
   * the old countdown, and crucially any pending fade-exit must not fire on
   * it (review bug H1). Does not touch master gain — the incoming scene's
   * own fade owns that.
   */
  reset(): void {
    this.clearTimers();
    this.status = 'off';
    this.endsAt = null;
    this.emit();
  }

  /** True while a timer or fade-exit is pending — for diagnostics/tests. */
  get isArmed(): boolean {
    return this.tick !== null || this.fadeExit !== null;
  }

  private check(): void {
    if (this.status !== 'running' || this.endsAt === null) return;
    if (Date.now() < this.endsAt) {
      this.emit(); // let subscribers refresh the countdown
      return;
    }
    // Time's up: fade now, stop once the fade has run its course.
    this.status = 'fading';
    this.endsAt = null;
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
    this.hooks.fade(SLEEP_TIMER_FADE_SECONDS);
    this.fadeExit = setTimeout(() => {
      this.fadeExit = null;
      this.status = 'off';
      this.hooks.stop();
      this.emit();
    }, SLEEP_TIMER_FADE_SECONDS * 1000 + FADE_EXIT_BUFFER_MS);
    this.emit();
  }

  private clearTimers(): void {
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
    if (this.fadeExit) {
      clearTimeout(this.fadeExit);
      this.fadeExit = null;
    }
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
