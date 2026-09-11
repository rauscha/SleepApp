// The SW keep-alive is reference-counted by holder. The bug this guards
// against: two independent holders (the playback session and a bare
// narration screen) sharing one on/off flag, so the second to stand down
// stopped the ping the first still wanted.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  __resetSwKeepAliveForTests,
  isSwKeepAliveRunning,
  startSwKeepAlive,
  stopSwKeepAlive,
  swKeepAliveHolders,
} from './keepAlive';

describe('SW keep-alive reference counting', () => {
  beforeEach(() => {
    __resetSwKeepAliveForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    __resetSwKeepAliveForTests();
    vi.useRealTimers();
  });

  it('runs while at least one holder wants it', () => {
    expect(isSwKeepAliveRunning()).toBe(false);
    startSwKeepAlive('session');
    expect(isSwKeepAliveRunning()).toBe(true);
    expect(swKeepAliveHolders()).toEqual(['session']);
  });

  it('keeps pinging for the scene bed when a bare meditation backs out', () => {
    // Tonight scene playing...
    startSwKeepAlive('session');
    // ...user plays an unpaired meditation over it...
    startSwKeepAlive('content');
    expect(swKeepAliveHolders().sort()).toEqual(['content', 'session']);

    // ...and backs out of it. The scene still has hours to run: with a
    // single flag this stopped the ping for the rest of the night.
    stopSwKeepAlive('content');

    expect(isSwKeepAliveRunning()).toBe(true);
    expect(swKeepAliveHolders()).toEqual(['session']);
  });

  it('stops only once the last holder stands down', () => {
    startSwKeepAlive('session');
    startSwKeepAlive('content');
    stopSwKeepAlive('content');
    stopSwKeepAlive('session');
    expect(isSwKeepAliveRunning()).toBe(false);
    expect(swKeepAliveHolders()).toEqual([]);
  });

  it('is idempotent per holder — a double start is one hold', () => {
    startSwKeepAlive('session');
    startSwKeepAlive('session');
    stopSwKeepAlive('session');
    expect(isSwKeepAliveRunning()).toBe(false);
  });

  it('ignores a stop from a holder that never started', () => {
    startSwKeepAlive('session');
    stopSwKeepAlive('never-held');
    expect(isSwKeepAliveRunning()).toBe(true);
    expect(swKeepAliveHolders()).toEqual(['session']);
  });

  it('defaults to a single shared holder name for legacy callers', () => {
    startSwKeepAlive();
    expect(swKeepAliveHolders()).toEqual(['default']);
    stopSwKeepAlive();
    expect(isSwKeepAliveRunning()).toBe(false);
  });

  it('posts a ping immediately and then on the interval', () => {
    const postMessage = vi.fn();
    const nav = navigator as unknown as { serviceWorker?: unknown };
    const prior = nav.serviceWorker;
    nav.serviceWorker = { controller: { postMessage } };
    try {
      startSwKeepAlive('session');
      expect(postMessage).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(20_000);
      expect(postMessage).toHaveBeenCalledTimes(2);
      stopSwKeepAlive('session');
      vi.advanceTimersByTime(60_000);
      expect(postMessage).toHaveBeenCalledTimes(2);
    } finally {
      if (prior === undefined) delete nav.serviceWorker;
      else nav.serviceWorker = prior;
    }
  });
});
