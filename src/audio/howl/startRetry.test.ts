// Tests for the start-retry ladder in defaultHowlFactory.
//
// These reproduce a real failure. On 2026-09-14 a forest-night session
// started, the page went hidden 1.3 s later, and three of four layers took
// a Howler playerror while hidden. The page came back 0.9 s after that, and
// nothing retried: the debug-marker export shows all three still paused with
// seek 0 seventeen minutes on, so the scene played one layer out of four all
// evening. Andrew reported it as "audio suddenly getting very quiet, as if
// one component just stopped playing".
//
// The ladder itself was never covered by a test, which is how it shipped
// spending its whole budget into a hidden document.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Stand-in for a real Howl: we drive `paused` by hand so the layer's
 *  isAudible() check sees a element that never started. */
class MockHowl {
  static all: MockHowl[] = [];
  opts: Record<string, (...a: unknown[]) => void>;
  playCalls = 0;
  node = { paused: true, readyState: 4, loop: false };
  _sounds = [{ _node: this.node }];
  constructor(opts: Record<string, (...a: unknown[]) => void>) {
    this.opts = opts;
    MockHowl.all.push(this);
  }
  play() {
    this.playCalls += 1;
    return 1;
  }
  once() {
    return this;
  }
  volume() {
    return 1;
  }
  fade() {
    return this;
  }
  pause() {
    return this;
  }
  stop() {
    return this;
  }
  unload() {
    return this;
  }
  playing() {
    return !this.node.paused;
  }
  seek() {
    return 0;
  }
  duration() {
    return 251;
  }
  state() {
    return 'loaded';
  }
}

vi.mock('howler', () => ({ Howl: MockHowl }));

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => value,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('start-retry ladder — the 2026-09-14 silent-layers failure', () => {
  beforeEach(async () => {
    MockHowl.all = [];
    vi.useFakeTimers();
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not spend retries while the document is hidden', async () => {
    const { defaultHowlFactory } = await import('./HowlScene');
    const layer = defaultHowlFactory({ src: ['/audio/x/wind-1.opus'] });
    layer.play();
    const howl = MockHowl.all[0]!;
    expect(howl.playCalls).toBe(1);

    // The page goes hidden before the element ever started. Chrome will not
    // begin playback here, so every attempt is guaranteed to fail.
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);

    // Budget intact: no attempt was thrown into a hidden document.
    expect(howl.playCalls).toBe(1);
  });

  it('retries once the page becomes visible again', async () => {
    const { defaultHowlFactory } = await import('./HowlScene');
    const layer = defaultHowlFactory({ src: ['/audio/x/wind-1.opus'] });
    layer.play();
    const howl = MockHowl.all[0]!;

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(howl.playCalls).toBe(1);

    // This is the transition that was doing nothing before.
    setVisibility('visible');
    expect(howl.playCalls).toBeGreaterThan(1);
  });

  it('leaves a layer alone once it is actually audible', async () => {
    const { defaultHowlFactory } = await import('./HowlScene');
    const layer = defaultHowlFactory({ src: ['/audio/x/wind-1.opus'] });
    layer.play();
    const howl = MockHowl.all[0]!;
    howl.node.paused = false; // it started

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(30_000);
    setVisibility('visible');

    // No spurious second play() — a second play() on a live html5 Howl is
    // what stacks a duplicate element.
    expect(howl.playCalls).toBe(1);
  });

  it('never restarts a layer the user deliberately stopped', async () => {
    const { defaultHowlFactory } = await import('./HowlScene');
    const layer = defaultHowlFactory({ src: ['/audio/x/wind-1.opus'] });
    layer.play();
    const howl = MockHowl.all[0]!;
    layer.stop();
    const after = howl.playCalls;

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(30_000);
    setVisibility('visible');

    expect(howl.playCalls).toBe(after);
  });

  it('stops listening once the layer is unloaded', async () => {
    const { defaultHowlFactory } = await import('./HowlScene');
    const layer = defaultHowlFactory({ src: ['/audio/x/wind-1.opus'] });
    layer.play();
    const howl = MockHowl.all[0]!;
    layer.unload();
    const after = howl.playCalls;

    setVisibility('hidden');
    setVisibility('visible');

    expect(howl.playCalls).toBe(after);
  });
});
