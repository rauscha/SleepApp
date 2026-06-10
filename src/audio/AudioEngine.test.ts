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
