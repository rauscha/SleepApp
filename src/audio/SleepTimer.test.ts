// SleepTimer state-machine tests (review bugs H1 + H3).
//
// The whole point of hoisting the timer out of PlayerScreen is that it
// keeps counting with no screen mounted, and that a new playback session
// can cancel a pending fade-exit so it never stops a later scene. These
// tests drive the machine directly with fake timers — no React involved,
// which is exactly the decoupling the fix buys us.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SleepTimer, SLEEP_TIMER_FADE_SECONDS } from './SleepTimer';

function makeHooks() {
  return {
    fade: vi.fn(),
    stop: vi.fn(),
    cancelFade: vi.fn(),
  };
}

// Fade-exit fires SLEEP_TIMER_FADE_SECONDS + 0.6s after the fade begins.
const FADE_EXIT_MS = SLEEP_TIMER_FADE_SECONDS * 1000 + 600;

describe('SleepTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fades then stops on schedule with no screen involved (H3)', () => {
    const hooks = makeHooks();
    const timer = new SleepTimer(hooks);

    timer.start(0.02); // 1200ms deadline; tick interval is 500ms
    expect(timer.getState().status).toBe('running');
    // Counts down against the wall clock.
    vi.advanceTimersByTime(500);
    expect(timer.getRemainingMs()).toBeGreaterThan(0);
    expect(timer.getRemainingMs()).toBeLessThanOrEqual(700);

    // The first tick at or past the deadline (t=1500) fires the fade.
    vi.advanceTimersByTime(1000);
    expect(timer.getState().status).toBe('fading');
    expect(hooks.fade).toHaveBeenCalledWith(SLEEP_TIMER_FADE_SECONDS);
    expect(hooks.stop).not.toHaveBeenCalled();

    // After the fade runs its course, the scene is stopped.
    vi.advanceTimersByTime(FADE_EXIT_MS);
    expect(hooks.stop).toHaveBeenCalledTimes(1);
    expect(timer.getState().status).toBe('off');
    expect(timer.isArmed).toBe(false);
  });

  it('reset() during the fade cancels the pending fade-exit (H1)', () => {
    const hooks = makeHooks();
    const timer = new SleepTimer(hooks);

    timer.start(0.02);
    vi.advanceTimersByTime(1500); // fire → fading, fade-exit scheduled
    expect(timer.getState().status).toBe('fading');
    expect(hooks.fade).toHaveBeenCalledTimes(1);

    // A new session takes over: the stale fade-exit must not fire.
    timer.reset();
    expect(timer.isArmed).toBe(false);
    expect(timer.getState().status).toBe('off');

    vi.advanceTimersByTime(FADE_EXIT_MS * 2);
    expect(hooks.stop).not.toHaveBeenCalled();
    // reset() is silent on the audio — the incoming scene owns the gain.
    expect(hooks.cancelFade).not.toHaveBeenCalled();
  });

  it('re-arming (start while running) replaces the previous countdown', () => {
    const hooks = makeHooks();
    const timer = new SleepTimer(hooks);

    timer.start(0.02); // 1200ms
    vi.advanceTimersByTime(600);
    timer.start(0.04); // 2400ms from now — replaces the first
    // The original 1200ms deadline must NOT fire.
    vi.advanceTimersByTime(1000); // total 1600ms < new 2400ms deadline
    expect(hooks.fade).not.toHaveBeenCalled();
    expect(timer.getState().status).toBe('running');

    vi.advanceTimersByTime(1500); // now past the new deadline
    expect(hooks.fade).toHaveBeenCalledTimes(1);
  });

  it('cancel() while running clears the timer with no audio side effect', () => {
    const hooks = makeHooks();
    const timer = new SleepTimer(hooks);

    timer.start(0.02);
    timer.cancel(0.8);
    expect(timer.getState().status).toBe('off');
    expect(timer.isArmed).toBe(false);
    expect(hooks.cancelFade).not.toHaveBeenCalled();

    vi.advanceTimersByTime(FADE_EXIT_MS * 2);
    expect(hooks.fade).not.toHaveBeenCalled();
    expect(hooks.stop).not.toHaveBeenCalled();
  });

  it('cancel() while fading restores master gain and aborts the stop', () => {
    const hooks = makeHooks();
    const timer = new SleepTimer(hooks);

    timer.start(0.02);
    vi.advanceTimersByTime(1500); // fading
    expect(timer.getState().status).toBe('fading');

    timer.cancel(0.8);
    expect(hooks.cancelFade).toHaveBeenCalledWith(0.8);
    expect(timer.getState().status).toBe('off');

    vi.advanceTimersByTime(FADE_EXIT_MS * 2);
    expect(hooks.stop).not.toHaveBeenCalled();
  });

  it('notifies subscribers on each tick and transition', () => {
    const hooks = makeHooks();
    const timer = new SleepTimer(hooks);
    const onChange = vi.fn();
    const unsub = timer.subscribe(onChange);

    timer.start(0.02);
    expect(onChange).toHaveBeenCalled();
    const afterStart = onChange.mock.calls.length;
    vi.advanceTimersByTime(500); // one tick
    expect(onChange.mock.calls.length).toBeGreaterThan(afterStart);

    unsub();
    const afterUnsub = onChange.mock.calls.length;
    vi.advanceTimersByTime(500);
    expect(onChange.mock.calls.length).toBe(afterUnsub);
  });
});
