// AudioEngine lifecycle tests.
//
// These exercise the gnarly mobile-browser lifecycle pieces that have no
// math we can test in isolation:
//   - unlock() resumes a suspended context (iOS Safari path)
//   - loadNoiseWorklet() caches success
//   - loadNoiseWorklet() clears the cache on failure → P1.3 regression
//     test for the "rejected promise lived forever" bug
//   - addLayer / removeLayer plumb through to the bus and emit events
//   - LayerCapExceededError when too many layers are registered

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, LayerCapExceededError } from './AudioEngine';
import {
  installAudioContextMock,
  MockGainNode,
  MockMediaStreamDestination,
  type MockAnalyserNode,
  type MockAudioContext,
} from '../test/audioMock';
import type { Layer } from './types';

function makeMockLayer(id: string): Layer & { startCalls: number; stopCalls: number; disposeCalls: number } {
  const output = new MockGainNode() as unknown as GainNode;
  const m = {
    id,
    label: id,
    output,
    startCalls: 0,
    stopCalls: 0,
    disposeCalls: 0,
    isPlaying: () => false,
    start: () => { m.startCalls++; },
    stop: async () => { m.stopCalls++; },
    fadeAndDispose: () => { m.disposeCalls++; },
    dispose: () => { m.disposeCalls++; },
    setVolume: () => {},
    getVolume: () => 0.5,
  };
  return m;
}

/** Flush the microtask queue a few times — used to settle the async
 *  element-sink engage/recover paths under fake timers. */
async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('AudioEngine', () => {
  let restore: () => void;

  beforeEach(() => {
    ({ restore } = installAudioContextMock());
  });

  afterEach(() => {
    restore();
    vi.useRealTimers();
  });

  it('unlock() creates the context and resumes it on first call', async () => {
    const engine = new AudioEngine();
    expect(engine.isInitialized).toBe(false);
    await engine.unlock();
    expect(engine.isInitialized).toBe(true);
    expect(engine.state).toBe('running');
  });

  // Regression test for the overnight "sound never comes back without
  // killing the app" bug: a context the platform refuses to resume must
  // be torn down and replaced inside the unlock() gesture, not handed
  // back to callers to schedule silence into.
  it('unlock() rebuilds a pre-existing context that refuses to resume', async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    const first = engine.context as unknown as MockAudioContext;
    await first.suspend();
    first.resumeNoOp = true;

    const kinds: string[] = [];
    engine.addListener((e) => kinds.push(e.kind));

    await engine.unlock();
    expect(engine.context as unknown as MockAudioContext).not.toBe(first);
    expect(engine.state).toBe('running');
    expect(first.state).toBe('closed');
    expect(kinds).toContain('context-recreated');
  });

  it('unlock() leaves a healthy running context alone', async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    const first = engine.context;
    await engine.unlock();
    expect(engine.context).toBe(first);
  });

  // Regression test for the 2026-06-11 overnight incident: Android killed
  // the audio rendering thread mid-night but left state === 'running', so
  // the watchdog's resume() no-oped against a zombie until the user opened
  // the app hours later. The watchdog must detect the frozen audio clock
  // across ticks and rebuild the context on its own — no user, no
  // visibilitychange.
  it('watchdog rebuilds a zombie context (running state, frozen clock) mid-session', async () => {
    vi.useFakeTimers();
    const engine = new AudioEngine();
    await engine.unlock();
    const first = engine.context as unknown as MockAudioContext;
    engine.startKeepAlive(); // what every scene/story session does
    const kinds: string[] = [];
    engine.addListener((e) => kinds.push(e.kind));

    // Healthy: clock advances between ticks — no recreation.
    first.advanceTime(2);
    vi.advanceTimersByTime(2000);
    first.advanceTime(2);
    vi.advanceTimersByTime(2000);
    expect(kinds).not.toContain('context-recreated');

    // Zombie: state stays 'running' but the clock freezes. Two stagnant
    // ticks trip the detector.
    vi.advanceTimersByTime(6000);
    expect(kinds).toContain('context-recreated');
    expect(engine.context as unknown as MockAudioContext).not.toBe(first);
    expect(engine.state).toBe('running');
    // The silent keep-alive must migrate to the new context so the
    // session stays pinned for the platform's audio-focus heuristic.
    expect(engine.isKeepAliveRunning).toBe(true);
  });

  describe('media element sink (tab-discard protection)', () => {
    beforeEach(() => {
      // jsdom's HTMLMediaElement.play() is unimplemented; the engine only
      // needs it to resolve (Chrome) or reject (autoplay refusal).
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue(undefined);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('routes the bus into a MediaStream sink during a session and back on stop', async () => {
      const engine = new AudioEngine();
      await engine.unlock();
      engine.startKeepAlive();
      // engage is async (awaits element.play()).
      await vi.waitFor(() => {
        const analyser = engine.bus.analyser as unknown as MockAnalyserNode;
        expect(
          analyser.connections.some(
            (c) => c instanceof MockMediaStreamDestination
          )
        ).toBe(true);
      });

      engine.stopKeepAlive();
      const analyser = engine.bus.analyser as unknown as MockAnalyserNode;
      const ctx = engine.context as unknown as MockAudioContext;
      expect(analyser.connections).toEqual([ctx.destination]);
    });

    it('falls back to direct output when element.play() is refused', async () => {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
        new Error('autoplay refused')
      );
      const engine = new AudioEngine();
      await engine.unlock();
      engine.startKeepAlive();
      await vi.waitFor(() => {
        const analyser = engine.bus.analyser as unknown as MockAnalyserNode;
        const ctx = engine.context as unknown as MockAudioContext;
        expect(analyser.connections).toEqual([ctx.destination]);
      });
      // The session itself must survive the refusal.
      expect(engine.isKeepAliveRunning).toBe(true);
    });

    it('re-engages the sink on the new context after recreateContext', async () => {
      const engine = new AudioEngine();
      await engine.unlock();
      engine.startKeepAlive();
      await vi.waitFor(() => {
        expect(
          (engine.bus.analyser as unknown as MockAnalyserNode).connections.some(
            (c) => c instanceof MockMediaStreamDestination
          )
        ).toBe(true);
      });

      engine.recreateContext();
      await vi.waitFor(() => {
        const analyser = engine.bus.analyser as unknown as MockAnalyserNode;
        expect(
          analyser.connections.some(
            (c) => c instanceof MockMediaStreamDestination
          )
        ).toBe(true);
      });
    });

    // Review bug C2 / roadmap 1.2: after the OS pauses the sink element, a
    // single refused replay used to leave the bus routed into a paused
    // element forever — silence the zombie watchdog can't see. The refused
    // replay must now detach the sink and restore audible direct output.
    it('a refused replay after a sink pause falls back to direct output', async () => {
      let sinkEl: HTMLAudioElement | undefined;
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const el = realCreate(tag);
        if (tag === 'audio') sinkEl = el as HTMLAudioElement;
        return el;
      }) as typeof document.createElement);

      const engine = new AudioEngine();
      await engine.unlock();
      engine.startKeepAlive();
      await vi.waitFor(() => {
        const analyser = engine.bus.analyser as unknown as MockAnalyserNode;
        expect(
          analyser.connections.some(
            (c) => c instanceof MockMediaStreamDestination
          )
        ).toBe(true);
      });
      expect(sinkEl).toBeDefined();

      // The OS pauses our element and then refuses the replay.
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
        new Error('autoplay refused')
      );
      sinkEl!.dispatchEvent(new Event('pause'));

      await vi.waitFor(() => {
        const analyser = engine.bus.analyser as unknown as MockAnalyserNode;
        const ctx = engine.context as unknown as MockAudioContext;
        // Detached: the analyser feeds hardware directly again, not the
        // stream destination.
        expect(analyser.connections).toEqual([ctx.destination]);
      });
      // The session itself survives — sound just took the direct path.
      expect(engine.isKeepAliveRunning).toBe(true);
    });

    // Review bug C2, layer c: even with no 'pause' event delivered, the
    // watchdog must notice a paused-but-engaged sink (ctx 'running', clock
    // advancing) and recover it on its own cadence.
    it('the watchdog recovers a paused-but-engaged sink', async () => {
      vi.useFakeTimers();
      const engine = new AudioEngine();
      await engine.unlock();
      engine.startKeepAlive();
      // Flush the async engage (await element.play()).
      await flushMicrotasks();
      const analyser = engine.bus.analyser as unknown as MockAnalyserNode;
      expect(
        analyser.connections.some((c) => c instanceof MockMediaStreamDestination)
      ).toBe(true);

      // The sink is paused out from under us and the replay stays refused.
      vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(true);
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
        new Error('autoplay refused')
      );

      // One watchdog tick, keeping the audio clock advancing so the zombie
      // path stays out of it — we're isolating the paused-sink signal.
      const ctx = engine.context as unknown as MockAudioContext;
      ctx.advanceTime(2);
      vi.advanceTimersByTime(2000);
      await flushMicrotasks();

      expect(analyser.connections).toEqual([ctx.destination]);
    });
  });

  it('watchdog does nothing without an active session', async () => {
    vi.useFakeTimers();
    const engine = new AudioEngine();
    await engine.unlock();
    const first = engine.context;
    const kinds: string[] = [];
    engine.addListener((e) => kinds.push(e.kind));
    // Clock frozen for many ticks, but no layers and no keep-alive — an
    // idle app must never churn contexts.
    vi.advanceTimersByTime(20_000);
    expect(kinds).not.toContain('context-recreated');
    expect(engine.context).toBe(first);
  });

  it('emits a state event when the context state changes', async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    const events: string[] = [];
    engine.addListener((e) => {
      if (e.kind === 'state') events.push(e.state);
    });
    await engine.context.suspend();
    expect(events).toContain('suspended');
  });

  describe('loadNoiseWorklet', () => {
    it('memoises a successful load — second call does not re-add the module', async () => {
      const engine = new AudioEngine();
      await engine.unlock();
      const ctx = engine.context as unknown as { workletAddModuleCalls: number; audioWorklet: { addModule: ReturnType<typeof vi.fn> } };
      await engine.loadNoiseWorklet();
      await engine.loadNoiseWorklet();
      expect(ctx.workletAddModuleCalls).toBe(1);
      expect(engine.isWorkletReady).toBe(true);
    });

    it('memoises an in-flight call — concurrent callers share one promise', async () => {
      const engine = new AudioEngine();
      await engine.unlock();
      const ctx = engine.context as unknown as { workletAddModuleCalls: number };
      const p1 = engine.loadNoiseWorklet();
      const p2 = engine.loadNoiseWorklet();
      await Promise.all([p1, p2]);
      expect(ctx.workletAddModuleCalls).toBe(1);
    });

    // P1.3 regression: a rejected workletPromise used to live forever.
    // After a transient failure (network blip, stale SW after a deploy),
    // every subsequent call returned the same rejection until the user
    // reloaded the tab. The fix clears the cached promise on failure so
    // the next call re-attempts cleanly.
    it('clears the cached promise on failure so a retry can succeed', async () => {
      const engine = new AudioEngine();
      await engine.unlock();
      const ctx = engine.context as unknown as { failWorkletOnce: boolean; workletAddModuleCalls: number };
      ctx.failWorkletOnce = true;

      await expect(engine.loadNoiseWorklet()).rejects.toThrow('mock-worklet-fail');
      expect(engine.isWorkletReady).toBe(false);

      // Retry — the cached rejected promise must be gone so this fires
      // a fresh addModule() call rather than returning the prior rejection.
      await expect(engine.loadNoiseWorklet()).resolves.toBeUndefined();
      expect(engine.isWorkletReady).toBe(true);
      expect(ctx.workletAddModuleCalls).toBe(2);
    });
  });

  describe('layer registry', () => {
    it('addLayer connects the layer output to the master bus and emits an event', async () => {
      const engine = new AudioEngine();
      await engine.unlock();
      const events: string[] = [];
      engine.addListener((e) => {
        if (e.kind === 'layer-added') events.push(`+${e.id}`);
        if (e.kind === 'layer-removed') events.push(`-${e.id}`);
      });
      const layer = makeMockLayer('one');
      engine.addLayer(layer);
      expect(engine.activeLayerCount).toBe(1);
      expect(events).toEqual(['+one']);
      const out = layer.output as unknown as MockGainNode;
      // The connection should target the bus input.
      expect(out.connections.length).toBe(1);
    });

    it('throws LayerCapExceededError past the soft cap and accepts allowOverCap', async () => {
      const engine = new AudioEngine();
      await engine.unlock();
      for (let i = 0; i < AudioEngine.LAYER_SOFT_CAP; i++) {
        engine.addLayer(makeMockLayer(`l${i}`));
      }
      expect(() => engine.addLayer(makeMockLayer('overflow'))).toThrow(
        LayerCapExceededError
      );
      // Bypass works.
      expect(() =>
        engine.addLayer(makeMockLayer('bypass'), { allowOverCap: true })
      ).not.toThrow();
    });

    it('removeLayer disposes the layer and emits a removed event', async () => {
      const engine = new AudioEngine();
      await engine.unlock();
      const events: string[] = [];
      engine.addListener((e) => {
        if (e.kind === 'layer-removed') events.push(e.id);
      });
      const layer = makeMockLayer('removable');
      engine.addLayer(layer);
      await engine.removeLayer('removable');
      expect(engine.activeLayerCount).toBe(0);
      expect(events).toEqual(['removable']);
      expect(layer.disposeCalls).toBe(1);
    });
  });
});
