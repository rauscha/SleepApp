// FileLayer pipeline tests.
//
// FileLayer is the load-bearing piece of the overnight-stability story.
// It pre-fills LOOKAHEAD_COUNT iterations at exact AudioContext times so
// even if iOS Safari throttles setTimeout to ~1Hz when backgrounded, the
// already-scheduled iterations play seamlessly off the audio clock with
// no main-thread involvement. A chain timer fires once per iteration to
// top-up the tail by one more iteration.
//
// These tests verify:
//   - Constructor invariants (empty pool, offset vs crossfade, buffer
//     length).
//   - start() pre-fills exactly LOOKAHEAD_COUNT iterations and the
//     pipeline is empty before start().
//   - Chain timer extends the pipeline tail by one iteration on each
//     fire (drives the long-haul loop).
//   - fadeAndDispose ramps the layer master output to 0 and schedules
//     source.stop() past the fade end on every live source.
//   - setVolume mid-playback schedules a 50ms ramp on the master.
//   - stop()-while-not-playing is a no-op (idempotency).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';
import { FileLayer } from './FileLayer';
import type { AudioVariant } from './FileLayer';
import { installAudioContextMock, type MockAudioContext } from '../test/audioMock';

const SAMPLE_RATE = 48_000;

function buf(ctx: AudioContext, durationSeconds: number): AudioBuffer {
  return ctx.createBuffer(2, Math.floor(durationSeconds * SAMPLE_RATE), SAMPLE_RATE);
}

function variant(id: string, ctx: AudioContext, durationSeconds: number, loopOffsetSeconds: number): AudioVariant {
  return { id, buffer: buf(ctx, durationSeconds), loopOffsetSeconds };
}

async function makeEngine(): Promise<AudioEngine> {
  const engine = new AudioEngine();
  await engine.unlock();
  return engine;
}

/**
 * AudioEngine.unlock() creates a 1-sample "primer" BufferSource to satisfy
 * iOS Safari's user-gesture audio unlock. Tests counting layer-created
 * sources need to filter that out. Capture the source-count baseline
 * after unlock() and assert against the delta.
 */
function newSources(
  mock: MockAudioContext,
  baseline: number
): number {
  return mock.getAllSources().length - baseline;
}

describe('FileLayer — constructor invariants', () => {
  let restore: () => void;
  beforeEach(() => { ({ restore } = installAudioContextMock()); });
  afterEach(() => { restore(); vi.useRealTimers(); });

  it('throws when given no variants', async () => {
    const engine = await makeEngine();
    expect(() => new FileLayer(engine, { id: 'l', label: 'L', variants: [] })).toThrow(
      /needs at least one variant/
    );
  });

  it('throws when loopOffset is not strictly greater than crossfade', async () => {
    const engine = await makeEngine();
    const ctx = engine.context;
    // crossfade defaults to 5s; an offset of 5s is invalid (we need a
    // strict >, not >=).
    expect(() =>
      new FileLayer(engine, {
        id: 'l',
        label: 'L',
        variants: [variant('v', ctx, 20, 5)],
        crossfadeSeconds: 5,
      })
    ).toThrow(/loopOffset .* must be greater than crossfade/);
  });

  it('throws when a variant buffer is too short for offset + crossfade', async () => {
    const engine = await makeEngine();
    const ctx = engine.context;
    // 7s buffer with 6s offset + 5s crossfade = 11s required tail; too short.
    expect(() =>
      new FileLayer(engine, {
        id: 'l',
        label: 'L',
        variants: [variant('v', ctx, 7, 6)],
        crossfadeSeconds: 5,
      })
    ).toThrow(/buffer duration .* is too short/);
  });
});

describe('FileLayer — pipeline lifecycle', () => {
  let restore: () => void;
  let mockCtx: MockAudioContext;

  beforeEach(() => {
    const inst = installAudioContextMock();
    restore = inst.restore;
    vi.useFakeTimers();
    // Bind mockCtx after engine.unlock() runs in each test — see below.
    mockCtx = inst.ctx;
    void mockCtx;
  });
  afterEach(() => { restore(); vi.useRealTimers(); });

  it('schedules nothing before start()', async () => {
    const engine = await makeEngine();
    const ctx = engine.context;
    const m = ctx as unknown as MockAudioContext;
    const baseline = m.getAllSources().length;
    const layer = new FileLayer(engine, {
      id: 'l', label: 'L',
      variants: [variant('v', ctx, 20, 10)],
    });
    expect(newSources(m, baseline)).toBe(0);
    void layer;
  });

  it('pre-fills exactly LOOKAHEAD_COUNT iterations on start()', async () => {
    const engine = await makeEngine();
    const ctx = engine.context;
    const m = ctx as unknown as MockAudioContext;
    const baseline = m.getAllSources().length;
    const layer = new FileLayer(engine, {
      id: 'l', label: 'L',
      variants: [variant('v', ctx, 20, 10)],
      crossfadeSeconds: 5,
    });
    layer.start();
    // LOOKAHEAD_COUNT is 3. Each iteration creates one BufferSource.
    expect(newSources(m, baseline)).toBe(3);
    // Iterations are scheduled at strictly increasing times spaced by
    // (loopOffset - crossfade) = 5 seconds. Started at currentTime=0 so:
    // 0, 5, 10.
    const startTimes = m.getAllSources().slice(baseline).map((s) => s.startedAt);
    expect(startTimes).toEqual([0, 5, 10]);
  });

  // Advance the audio clock and the setTimeout clock in lockstep —
  // mirroring how they move together in production. Stepping in small
  // increments matters because armChainTimer recomputes the next
  // delay from (target.startedAt - currentTime); advancing the two
  // clocks asymmetrically lets the timer cascade in ways production
  // never sees.
  function advanceBothClocks(m: MockAudioContext, totalSeconds: number) {
    const stepMs = 50;
    let elapsedMs = 0;
    const totalMs = totalSeconds * 1000;
    while (elapsedMs < totalMs) {
      const step = Math.min(stepMs, totalMs - elapsedMs);
      m.advanceTime(step / 1000);
      vi.advanceTimersByTime(step);
      elapsedMs += step;
    }
  }

  it('chain timer keeps the pipeline alive across multiple iteration periods', async () => {
    const engine = await makeEngine();
    const ctx = engine.context;
    const m = ctx as unknown as MockAudioContext;
    const baseline = m.getAllSources().length;
    const layer = new FileLayer(engine, {
      id: 'l', label: 'L',
      variants: [variant('v', ctx, 30, 10)],
      crossfadeSeconds: 5,
    });
    layer.start();
    expect(newSources(m, baseline)).toBe(3);

    // Iteration period = loopOffset - crossfade = 5s. Advance two
    // full periods. The load-bearing invariant: the pipeline must
    // ALWAYS have at least one source scheduled to start strictly
    // after the current audio time, or the loop is about to drop.
    advanceBothClocks(m, 10);
    const afterTwoPeriods = m.getAllSources().slice(baseline);
    const futureSources = afterTwoPeriods.filter((s) => (s.startedAt ?? -1) > m.currentTime);
    expect(futureSources.length).toBeGreaterThanOrEqual(1);

    // And: the chain timer extended the pipeline by at least one
    // iteration per period (loose lower bound; tighter bounds are
    // schedule-detail).
    expect(afterTwoPeriods.length).toBeGreaterThanOrEqual(3 + 2);
    // No runaway growth — the chain timer fires once per iteration,
    // never in a tight loop adding many iters at once.
    expect(afterTwoPeriods.length).toBeLessThanOrEqual(3 + 4);
  });

  it('fadeAndDispose ramps master output to 0 and stops all live sources past the fade end', async () => {
    const engine = await makeEngine();
    const ctx = engine.context;
    const m = ctx as unknown as MockAudioContext;
    const baseline = m.getAllSources().length;
    const layer = new FileLayer(engine, {
      id: 'l', label: 'L',
      variants: [variant('v', ctx, 30, 10)],
      crossfadeSeconds: 5,
    });
    layer.start();
    const sources = m.getAllSources().slice(baseline);
    expect(sources.length).toBe(3);

    layer.fadeAndDispose(8);

    // Master output is a MockGainNode; its gain param should now have a
    // linearRampToValueAtTime(0, now + 8) scheduled.
    const out = layer.output as unknown as { gain: { scheduledEvents: { kind: string; value?: number; time: number }[] } };
    const rampToZero = out.gain.scheduledEvents.find(
      (e) => e.kind === 'linearRampToValueAtTime' && e.value === 0
    );
    expect(rampToZero).toBeDefined();
    expect(rampToZero!.time).toBeCloseTo(8, 5);

    // Every live source must have a stop scheduled past the fade end
    // (fade + small epsilon).
    for (const src of sources) {
      expect(src.stoppedAt).not.toBeNull();
      expect(src.stoppedAt!).toBeGreaterThan(8);
    }
  });

  it('setVolume mid-playback schedules a 50ms ramp on the master', async () => {
    const engine = await makeEngine();
    const ctx = engine.context;
    const layer = new FileLayer(engine, {
      id: 'l', label: 'L',
      variants: [variant('v', ctx, 30, 10)],
      defaultVolume: 0.5,
    });
    layer.start();

    layer.setVolume(0.2);
    const out = layer.output as unknown as { gain: { scheduledEvents: { kind: string; value?: number; time: number }[] } };
    const last = out.gain.scheduledEvents[out.gain.scheduledEvents.length - 1]!;
    expect(last.kind).toBe('linearRampToValueAtTime');
    expect(last.value).toBeCloseTo(0.2, 5);
    expect(last.time).toBeCloseTo(0.05, 5);
    expect(layer.getVolume()).toBeCloseTo(0.2, 5);
  });

  it('stop()-while-not-playing is a no-op (idempotent)', async () => {
    const engine = await makeEngine();
    const ctx = engine.context;
    const layer = new FileLayer(engine, {
      id: 'l', label: 'L',
      variants: [variant('v', ctx, 30, 10)],
    });
    await expect(layer.stop()).resolves.toBeUndefined();
  });
});
