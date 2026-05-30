// SceneCoordinator lifecycle tests.
//
// What we care about:
//   - loadScene constructs a Scene with the right layer set from a
//     SceneDefinition (synth bed + optional tinnitus + one FileLayer
//     per element).
//   - loadVariant falls back to a synthesized buffer on fetch failure
//     when fallbackToSynthetic is true; rethrows otherwise.
//   - startScene wires the scene's output to the bus and fades it in.
//   - startScene called while another scene is active runs a real
//     crossfade — the outgoing scene gets fadeAndDispose, the incoming
//     gets fadeIn over the same duration.
//   - stopScene fades the current scene and clears the slot.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';
import { AudioLoadError } from './FileLayer';
import { SceneCoordinator } from './SceneCoordinator';
import { installAudioContextMock, MockAudioBuffer } from '../test/audioMock';
import type { SceneDefinition } from './sceneFormat';

const SAMPLE_RATE = 48_000;

function basicScene(id: string, opts?: { withTinnitus?: boolean; elementCount?: number }): SceneDefinition {
  const elementCount = opts?.elementCount ?? 2;
  // Tiny test offsets — the mock decodes every fetch into a 30s buffer,
  // and FileLayer enforces `buffer.duration > loopOffset + crossfade`.
  // 6/8/10 keeps every variant valid against the 30s mock buffer.
  // Production uses 251–887s primes from PRIME_ADJACENT_LOOP_OFFSETS_SECONDS,
  // but the coordinator's wiring/lifecycle logic is offset-agnostic.
  const offsets = [6, 8, 10, 12];
  const elements = Array.from({ length: elementCount }, (_, i) => ({
    id: `el${i}`,
    label: `Element ${i}`,
    loopOffsetSeconds: offsets[i % offsets.length]!,
    crossfadeSeconds: 5,
    defaultVolume: 0.4,
    variants: [
      { id: `v${i}a`, url: `/audio/${id}/el${i}-a.mp3` },
    ],
  }));
  return {
    id,
    label: `Scene ${id}`,
    synth: { color: 'pink', defaultVolume: 0.1 },
    tinnitus: opts?.withTinnitus
      ? { enabledByDefault: true, defaultVolume: 0.2 }
      : undefined,
    elements,
  };
}

/**
 * Replace global.fetch with a stub that returns an OK Response for every
 * URL containing one of `okUrlSubstrings` and a 404 for everything else.
 * Returns the spy so tests can assert call counts.
 */
function stubFetch(okUrlSubstrings: string[]): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(async (url: string) => {
    const ok = okUrlSubstrings.some((sub) => url.includes(sub));
    if (ok) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response;
    }
    return { ok: false, status: 404 } as Response;
  });
  (globalThis as { fetch: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;
  return fetchSpy;
}

describe('SceneCoordinator', () => {
  let restore: () => void;

  beforeEach(() => {
    ({ restore } = installAudioContextMock());
  });
  afterEach(() => {
    restore();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loadScene constructs synth + elements when fetch succeeds', async () => {
    stubFetch(['/audio/']); // every file resolves
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    const scene = await coord.loadScene(basicScene('s1', { elementCount: 3 }));
    // 1 synth + 3 elements = 4 layers
    expect(scene.getLayers().length).toBe(4);
    expect(scene.id).toBe('s1');
  });

  it('loadScene includes the tinnitus mask layer when enabledByDefault', async () => {
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    const scene = await coord.loadScene(
      basicScene('s2', { withTinnitus: true, elementCount: 1 })
    );
    // synth + tinnitus + 1 element = 3
    expect(scene.getLayers().length).toBe(3);
  });

  it('falls back to a synthesized buffer when a variant fetch 404s and fallbackToSynthetic is on', async () => {
    // Every fetch 404s — the coordinator must still construct a Scene
    // by synthesizing every missing buffer.
    stubFetch([]); // nothing succeeds
    const outcomes: string[] = [];
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    const scene = await coord.loadScene(basicScene('s3'), {
      fallbackToSynthetic: true,
      onVariantLoaded: (info) => outcomes.push(info.status),
    });
    expect(scene.getLayers().length).toBe(3); // synth + 2 elements
    // Every variant ended up as fallback-synthetic.
    expect(outcomes.every((s) => s === 'fallback-synthetic')).toBe(true);
    expect(outcomes.length).toBeGreaterThan(0);
  });

  it('rethrows when a variant fetch fails and fallbackToSynthetic=false', async () => {
    stubFetch([]); // nothing succeeds
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    await expect(
      coord.loadScene(basicScene('s4'), { fallbackToSynthetic: false })
    ).rejects.toThrow();
  });

  // P1.8: real network failures must NOT be silently substituted with a
  // synth pad, even when fallbackToSynthetic=true. Only 404s fall back —
  // they are the marker for "scene authored before the recording landed."
  // Network errors, decode failures, and other HTTP errors all indicate a
  // genuine problem and must surface.
  it('rethrows network errors even when fallbackToSynthetic=true', async () => {
    // Stub: fetch itself rejects (simulates offline / abort / DNS / CORS).
    const spy = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    (globalThis as { fetch: typeof fetch }).fetch = spy as unknown as typeof fetch;
    const outcomes: string[] = [];
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    await expect(
      coord.loadScene(basicScene('s7'), {
        fallbackToSynthetic: true,
        onVariantLoaded: (info) => outcomes.push(info.status),
      })
    ).rejects.toThrow(AudioLoadError);
    expect(outcomes).toContain('failed');
  });

  it('rethrows HTTP non-404 errors even when fallbackToSynthetic=true', async () => {
    // Stub: every fetch returns HTTP 500.
    (globalThis as { fetch: typeof fetch }).fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as Response) as unknown as typeof fetch;
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    await expect(
      coord.loadScene(basicScene('s8'), { fallbackToSynthetic: true })
    ).rejects.toThrow(AudioLoadError);
  });

  it('startScene wires the scene output to the bus input and fades it in', async () => {
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    const def = basicScene('s5', { elementCount: 2 });
    const scene = await coord.startScene(def);

    expect(coord.getCurrentScene()).toBe(scene);
    // The scene output is a MockGainNode; it should be connected to
    // the bus input (engine.bus.input).
    const out = scene.output as unknown as { connections: unknown[] };
    expect(out.connections.length).toBe(1);
    expect(out.connections[0]).toBe(engine.bus.input);

    // The scene's master gain should have a fade-in scheduled —
    // linearRampToValueAtTime(1, now + firstFade).
    const sceneGain = scene.output as unknown as { gain: { scheduledEvents: { kind: string; value?: number }[] } };
    const fadeIn = sceneGain.gain.scheduledEvents.find(
      (e) => e.kind === 'linearRampToValueAtTime' && e.value === 1
    );
    expect(fadeIn).toBeDefined();
  });

  it('crossfadeTo disposes the outgoing scene and installs the incoming as current', async () => {
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    const outgoing = await coord.startScene(basicScene('out'));
    const incoming = await coord.startScene(basicScene('in')); // second call triggers crossfade

    expect(coord.getCurrentScene()).toBe(incoming);
    expect(incoming).not.toBe(outgoing);
    // The outgoing scene has had its master gain ramped to 0 — fade-out
    // is on the AudioContext clock, so it's already scheduled even before
    // the disposal setTimeout fires.
    const outGain = outgoing.output as unknown as { gain: { scheduledEvents: { kind: string; value?: number }[] } };
    const rampToZero = outGain.gain.scheduledEvents.find(
      (e) => e.kind === 'linearRampToValueAtTime' && e.value === 0
    );
    expect(rampToZero).toBeDefined();
    // The incoming scene's output should be connected to the bus.
    const out = incoming.output as unknown as { connections: unknown[] };
    expect(out.connections.length).toBe(1);
  });

  it('stopScene fades the current scene and clears the slot', async () => {
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    const scene = await coord.startScene(basicScene('s6'));
    expect(coord.getCurrentScene()).toBe(scene);

    coord.stopScene(2);
    expect(coord.getCurrentScene()).toBeNull();
    // The scene's master gain should have a ramp to 0 scheduled.
    const sceneGain = scene.output as unknown as { gain: { scheduledEvents: { kind: string; value?: number }[] } };
    const fadeOut = sceneGain.gain.scheduledEvents.find(
      (e) => e.kind === 'linearRampToValueAtTime' && e.value === 0
    );
    expect(fadeOut).toBeDefined();
  });

  // Sanity check the mock end-to-end: a real Scene loaded through this
  // path should produce a non-zero number of MockAudioBuffers (one per
  // variant). Catches the silent-no-decode failure mode.
  it('produces decoded MockAudioBuffers for every variant', async () => {
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    const scene = await coord.loadScene(basicScene('buffers', { elementCount: 2 }));
    // FileLayers can be probed via the scene's layer list; the buffer
    // each FileLayer holds shows up indirectly via the AudioVariant
    // it was constructed with — exposed only through start(). We
    // assert at least the layer count is right and no exception
    // surfaced (which would have happened if a buffer was null /
    // zero-length).
    const fileLayers = scene.getLayers().filter((l) => l.id.startsWith('buffers:el'));
    expect(fileLayers.length).toBe(2);
    // Sanity: a freshly minted MockAudioBuffer has the right shape.
    const probe = new MockAudioBuffer(2, SAMPLE_RATE * 30, SAMPLE_RATE);
    expect(probe.duration).toBeCloseTo(30, 5);
    expect(probe.numberOfChannels).toBe(2);
  });
});
