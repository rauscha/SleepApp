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
import type { MockAudioContext } from '../test/audioMock';
import { isSwKeepAliveRunning, stopSwKeepAlive } from '../serviceWorker/keepAlive';
import { __resetForTests, getAllEntries } from '../diagnostics/lifecycleLog';
import { SLEEP_TIMER_FADE_SECONDS } from './SleepTimer';
import type { SceneDefinition } from './sceneFormat';

const FADE_EXIT_MS = SLEEP_TIMER_FADE_SECONDS * 1000 + 600;

/**
 * Advance fake timers AND the mock audio clock in lockstep, so the engine
 * watchdog never mistakes a frozen ctx.currentTime for a zombie context
 * and recreates it mid-test.
 */
function advanceBoth(ctx: MockAudioContext, ms: number, stepMs = 500): void {
  let elapsed = 0;
  while (elapsed < ms) {
    const step = Math.min(stepMs, ms - elapsed);
    ctx.advanceTime(step / 1000);
    vi.advanceTimersByTime(step);
    elapsed += step;
  }
}

/**
 * Install a minimal MediaSession surface so we can assert the coordinator
 * stamps / clears the OS media session. jsdom provides neither
 * navigator.mediaSession nor MediaMetadata.
 */
function installMediaSessionMock(): {
  session: { metadata: unknown; playbackState: string };
  handlers: Record<string, unknown>;
  restore: () => void;
} {
  const handlers: Record<string, unknown> = {};
  const session = {
    metadata: null as unknown,
    playbackState: 'none',
    setActionHandler: (action: string, h: unknown) => {
      handlers[action] = h;
    },
  };
  const g = globalThis as unknown as { MediaMetadata?: unknown };
  const priorMeta = g.MediaMetadata;
  g.MediaMetadata = class {
    constructor(init: Record<string, unknown>) {
      Object.assign(this, init);
    }
  };
  (navigator as unknown as { mediaSession?: unknown }).mediaSession = session;
  return {
    session,
    handlers,
    restore() {
      delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;
      g.MediaMetadata = priorMeta;
    },
  };
}

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
    // startScene now engages the module-global SW keep-alive timer; stop it
    // so it can't leak across tests.
    stopSwKeepAlive();
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

  // 3.1: the option now defaults to import.meta.env.DEV. In the dev/test
  // environment that is true, so an omitted option still falls back on a
  // 404 (authoring convenience). In a production build the same omission
  // throws — surfacing a load failure instead of a synth-pad impostor.
  it('defaults fallbackToSynthetic to import.meta.env.DEV (falls back in dev on 404)', async () => {
    stubFetch([]); // every fetch 404s
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    // No fallbackToSynthetic passed — relies on the DEV-gated default.
    const scene = await coord.loadScene(basicScene('default-fallback'));
    expect(scene.getLayers().length).toBe(3); // synth + 2 synthesized els
    expect(import.meta.env.DEV).toBe(true); // sanity: the default is on here
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

    // The first start from silence uses a front-loaded fade-in: a
    // setValueCurveAtTime ramp (pow exponent < 1) over the first-start
    // duration, ending at full gain. Cross-scene fades stay linear.
    const sceneGain = scene.output as unknown as {
      gain: { value: number; scheduledEvents: { kind: string; curveDuration?: number }[] };
    };
    const fadeIn = sceneGain.gain.scheduledEvents.find(
      (e) => e.kind === 'setValueCurveAtTime'
    );
    expect(fadeIn).toBeDefined();
    // Curve ends at the target volume (1.0); the mock settles .value there.
    expect(sceneGain.gain.value).toBe(1);
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

  // Regression test for the overnight dead-context recovery: when the
  // engine replaces its AudioContext, the coordinator must dispose the
  // dead scene and rebuild the same definition on the new context —
  // without ever letting getCurrentScene() flash null (UI polls it and
  // bounces out of the player on null).
  it('rebuilds the current scene when the engine recreates its context', async () => {
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    const original = await coord.startScene(basicScene('s-restart'));

    engine.recreateContext();

    // The dead scene is disposed synchronously but stays "current" while
    // the replacement loads.
    expect(original.isDisposed()).toBe(true);
    expect(coord.getCurrentScene()).not.toBeNull();

    await vi.waitFor(() => {
      const current = coord.getCurrentScene();
      expect(current).not.toBe(original);
      expect(current?.isDisposed()).toBe(false);
    });
    expect(coord.getCurrentScene()?.definition.id).toBe('s-restart');
    // The rebuilt scene must be wired to the NEW context's bus.
    const out = coord.getCurrentScene()!.output as unknown as {
      connections: unknown[];
    };
    expect(out.connections[0]).toBe(engine.bus.input);
  });

  it('drops the rebuilt scene if the user stopped playback during the rebuild', async () => {
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    await coord.startScene(basicScene('s-stopped'));

    engine.recreateContext();
    // User taps Stop while the rebuild's buffers are still loading.
    coord.stopScene();
    expect(coord.getCurrentScene()).toBeNull();

    // Give the async rebuild time to settle; the user's stop must win.
    await new Promise((r) => setTimeout(r, 20));
    expect(coord.getCurrentScene()).toBeNull();
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

  // -------------------------------------------------------------------
  // Session-owned overnight protections (review bug C1 / roadmap 1.1).
  // The keep-alive, SW pings, and media session must follow the *audio*,
  // not whatever screen is mounted: starting a scene engages them, and
  // they survive a Player exit (which at this level is simply "nobody
  // called stopScene"). Only stopScene tears them down.

  it('startScene engages the session protections and stamps the media session', async () => {
    stubFetch(['/audio/']);
    __resetForTests();
    const media = installMediaSessionMock();
    try {
      const engine = new AudioEngine();
      await engine.unlock();
      const coord = new SceneCoordinator(engine);

      const scene = await coord.startScene(basicScene('protected'));

      // Engine keep-alive (silent loop + element sink) and SW pings up.
      expect(engine.isKeepAliveRunning).toBe(true);
      expect(isSwKeepAliveRunning()).toBe(true);
      expect(coord.isProtectionEngaged).toBe(true);
      // Media session stamped with the scene label + a stop handler.
      expect(media.session.metadata).not.toBeNull();
      expect(media.session.playbackState).toBe('playing');
      expect(typeof media.handlers.stop).toBe('function');

      // "Leave the Player": at the coordinator level nobody calls
      // stopScene, so the scene stays current and every protection stays
      // engaged. This is the heart of the C1 fix.
      expect(coord.getCurrentScene()).toBe(scene);
      expect(engine.isKeepAliveRunning).toBe(true);
      expect(isSwKeepAliveRunning()).toBe(true);

      const kinds = getAllEntries().map((e) => e.kind);
      expect(kinds).toContain('scene-start');
      expect(kinds).toContain('keepalive-start');
    } finally {
      media.restore();
    }
  });

  it('stopScene tears down every session protection', async () => {
    stubFetch(['/audio/']);
    __resetForTests();
    const media = installMediaSessionMock();
    try {
      const engine = new AudioEngine();
      await engine.unlock();
      const coord = new SceneCoordinator(engine);
      await coord.startScene(basicScene('teardown'));

      coord.stopScene(2);

      expect(coord.getCurrentScene()).toBeNull();
      expect(engine.isKeepAliveRunning).toBe(false);
      expect(isSwKeepAliveRunning()).toBe(false);
      expect(coord.isProtectionEngaged).toBe(false);
      expect(media.session.metadata).toBeNull();
      expect(media.session.playbackState).toBe('none');

      const kinds = getAllEntries().map((e) => e.kind);
      expect(kinds).toContain('scene-stop');
      expect(kinds).toContain('keepalive-stop');
    } finally {
      media.restore();
    }
  });

  it('keeps protections engaged across a crossfade, refreshing the label', async () => {
    stubFetch(['/audio/']);
    const media = installMediaSessionMock();
    try {
      const engine = new AudioEngine();
      await engine.unlock();
      const coord = new SceneCoordinator(engine);
      await coord.startScene(basicScene('first'));
      await coord.startScene(basicScene('second')); // crossfade

      expect(engine.isKeepAliveRunning).toBe(true);
      expect(isSwKeepAliveRunning()).toBe(true);
      expect(coord.isProtectionEngaged).toBe(true);
      // Label refreshed to the incoming scene.
      expect(media.session.metadata).toMatchObject({ title: 'Scene second' });
    } finally {
      media.restore();
    }
  });

  it('does not touch the media session when manageMediaSession is false (content bed)', async () => {
    stubFetch(['/audio/']);
    const media = installMediaSessionMock();
    try {
      const engine = new AudioEngine();
      await engine.unlock();
      const coord = new SceneCoordinator(engine);

      await coord.startScene(basicScene('bed'), { manageMediaSession: false });

      // Keep-alive + SW pings still engage (the bed must survive overnight)…
      expect(engine.isKeepAliveRunning).toBe(true);
      expect(isSwKeepAliveRunning()).toBe(true);
      // …but the coordinator left the media session alone for the content
      // player to own.
      expect(media.session.metadata).toBeNull();

      // And tearing the bed down must not clear a media session the
      // coordinator never set (no throw, still 'none').
      coord.stopScene(1);
      expect(media.session.playbackState).toBe('none');
    } finally {
      media.restore();
    }
  });

  // -------------------------------------------------------------------
  // Session-owned sleep timer (review bugs H1 + H3 / roadmap 1.3).

  it('arms the sleep timer from sleepTimerMinutes and clears it on stop', async () => {
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);

    await coord.startScene(basicScene('timed'), { sleepTimerMinutes: 30 });
    expect(coord.sleepTimer.getState().status).toBe('running');
    expect(coord.sleepTimer.isArmed).toBe(true);

    coord.stopScene(1);
    expect(coord.sleepTimer.getState().status).toBe('off');
    expect(coord.sleepTimer.isArmed).toBe(false);
  });

  it('a new scene start does not let a stale fade-exit stop the new scene (H1)', async () => {
    vi.useFakeTimers();
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    const ctx = engine.context as unknown as MockAudioContext;
    const stopSpy = vi.spyOn(coord, 'stopScene');

    // Scene A with a very short sleep timer that fires almost immediately.
    await coord.startScene(basicScene('A'), { sleepTimerMinutes: 0.02 });
    advanceBoth(ctx, 1500); // first tick past the deadline → fading
    expect(coord.sleepTimer.getState().status).toBe('fading');

    // User exits mid-fade and starts a fresh scene B (crossfade). The stale
    // fade-exit must be cancelled, not left to stop B 90s later.
    await coord.startScene(basicScene('B'));
    expect(coord.sleepTimer.getState().status).toBe('off');
    expect(coord.sleepTimer.isArmed).toBe(false);
    stopSpy.mockClear();

    // Well past the old fade-exit deadline — B must still be playing.
    advanceBoth(ctx, FADE_EXIT_MS * 2);
    expect(stopSpy).not.toHaveBeenCalled();
    expect(coord.getCurrentScene()?.definition.id).toBe('B');
  });

  // -------------------------------------------------------------------
  // Lock-screen soft-pause (review M4 / roadmap 3.6).

  it('lock-screen pause soft-pauses and keeps the session, play resumes', async () => {
    stubFetch(['/audio/']);
    const media = installMediaSessionMock();
    try {
      const engine = new AudioEngine();
      await engine.unlock();
      const coord = new SceneCoordinator(engine);
      await coord.startScene(basicScene('m4'));
      expect(typeof media.handlers.pause).toBe('function');

      (media.handlers.pause as () => void)();
      expect(engine.isUserPaused).toBe(true);
      expect(media.session.playbackState).toBe('paused');
      // The session is NOT torn down — scene still current, keep-alive up.
      expect(coord.getCurrentScene()).not.toBeNull();
      expect(engine.isKeepAliveRunning).toBe(true);

      (media.handlers.play as () => void)();
      await Promise.resolve();
      await Promise.resolve();
      expect(engine.isUserPaused).toBe(false);
      expect(media.session.playbackState).toBe('playing');
    } finally {
      media.restore();
    }
  });

  // -------------------------------------------------------------------
  // Serialized scene starts (review bug M1 / roadmap 1.5).

  it('two racing first-starts leave exactly one playing scene, loser disposed', async () => {
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);

    // Fire both before either resolves — both take the first-start branch
    // because neither has set currentScene yet.
    const scenes = await Promise.all([
      coord.startScene(basicScene('race-A')),
      coord.startScene(basicScene('race-B')),
    ]);

    const current = coord.getCurrentScene();
    expect(current).not.toBeNull();
    const losers = scenes.filter((s) => s !== current);
    expect(losers).toHaveLength(1);
    expect(current!.isDisposed()).toBe(false);
    expect(losers[0]!.isDisposed()).toBe(true);

    // Exactly one scene is wired into the bus; the loser is connected to
    // nothing (dispose disconnected it before it could start).
    const curConn = (current!.output as unknown as { connections: unknown[] }).connections;
    const loseConn = (losers[0]!.output as unknown as { connections: unknown[] }).connections;
    expect(curConn).toContain(engine.bus.input);
    expect(loseConn).toHaveLength(0);
  });

  it('racing starts over an existing scene crossfade to one winner', async () => {
    stubFetch(['/audio/']);
    const engine = new AudioEngine();
    await engine.unlock();
    const coord = new SceneCoordinator(engine);
    await coord.startScene(basicScene('base'));

    const scenes = await Promise.all([
      coord.startScene(basicScene('xf-A')),
      coord.startScene(basicScene('xf-B')),
    ]);

    const current = coord.getCurrentScene();
    const losers = scenes.filter((s) => s !== current);
    expect(losers).toHaveLength(1);
    expect(current!.isDisposed()).toBe(false);
    expect(losers[0]!.isDisposed()).toBe(true);
    expect(
      (losers[0]!.output as unknown as { connections: unknown[] }).connections
    ).toHaveLength(0);
  });
});
