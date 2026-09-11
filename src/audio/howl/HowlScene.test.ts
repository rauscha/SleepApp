// Tests for the Path A Howler bed engine. A fake HowlLike factory lets us
// assert the volume/fade/lifecycle behaviour without a real AudioContext or
// DOM media element.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyNativeLoop,
  HowlScene,
  howlFormats,
  SYNTH_BED_LOOP_SECONDS,
} from './HowlScene';
import type { HowlLike, HowlFactory, HowlFactoryOptions } from './HowlScene';
import {
  HowlScenePlayer,
  __resetHowlScenePlayerForTests,
} from './HowlScenePlayer';
import type { SceneDefinition } from '../sceneFormat';
import {
  __resetMarkersForTests,
  getMarkers,
  seamSuspects,
} from '../../diagnostics/markers';
import { resetSettings, setSetting } from '../../storage';

class FakeHowl implements HowlLike {
  static all: FakeHowl[] = [];
  readonly opts: HowlFactoryOptions;
  vol = 0;
  played = false;
  /** How many times play() was called — a second call while already
   *  playing is what creates a duplicate element in real Howler. */
  playCalls = 0;
  stopped = false;
  unloaded = false;
  paused = false;
  /** Models Howler: a fade() is "running" until volume()/stop() cancels it. */
  fadeActive = false;
  fades: Array<[number, number, number]> = [];

  constructor(opts: HowlFactoryOptions) {
    this.opts = opts;
    FakeHowl.all.push(this);
  }
  play(): number {
    this.playCalls += 1;
    this.played = true;
    this.paused = false;
    // Real html5 Howls fire onplay asynchronously once they can play; the
    // layer applies its fade-in there. Fire it synchronously for the test.
    this.opts.onplay?.();
    return 1;
  }
  pause(): void {
    this.paused = true;
  }
  stop(): unknown {
    this.stopped = true;
    return this;
  }
  unload(): void {
    this.unloaded = true;
  }
  fade(from: number, to: number, durationMs: number): unknown {
    this.fades.push([from, to, durationMs]);
    this.vol = to;
    this.fadeActive = true;
    return this;
  }
  volume(level?: number): number {
    if (level === undefined) return this.vol;
    // Howler's volume() setter cancels any running fade (_stopFade). Model
    // that here so tests can catch a stray volume() that kills a sleep-timer
    // fade — the O1 regression.
    this.vol = level;
    this.fadeActive = false;
    return level;
  }
  playing(): boolean {
    return this.played && !this.stopped && !this.paused;
  }
  /** Scripted playback position; mirrors Howler's seek() getter. */
  seekValue = 0;
  seekThrows = false;
  seek(): number {
    if (this.seekThrows) throw new Error('no element');
    return this.seekValue;
  }
}

const fakeFactory: HowlFactory = (opts: HowlFactoryOptions) => new FakeHowl(opts);

const firstVariant = (el: { variants: { id: string; url: string }[] }) =>
  el.variants[0]!;

/** Find the fake Howl whose source url contains `sub` (robust to layer order;
 *  the synth bed is now layer 0, so index-based lookups would be brittle). */
const bySrc = (sub: string): FakeHowl =>
  FakeHowl.all.find((h) => h.opts.src.some((s) => s.includes(sub)))!;

function makeDef(overrides: Partial<SceneDefinition> = {}): SceneDefinition {
  return {
    id: 'test-scene',
    label: 'Test Scene',
    synth: { color: 'brown', defaultVolume: 0.1 },
    elements: [
      {
        id: 'rain',
        label: 'Rain',
        loopOffsetSeconds: 251,
        defaultVolume: 0.5,
        variants: [{ id: 'rain-1', url: '/audio/test/rain-1.mp3' }],
      },
      {
        id: 'wind',
        label: 'Wind',
        loopOffsetSeconds: 409,
        defaultVolume: 0.3,
        variants: [{ id: 'wind-1', url: '/audio/test/wind-1.mp3' }],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  FakeHowl.all = [];
  __resetHowlScenePlayerForTests();
  localStorage.clear();
  __resetMarkersForTests();
  resetSettings();
});

describe('howlFormats (O2 — Howler format is positional, not a fallback list)', () => {
  it('derives the format from each src extension, so an .mp3 is not opus-gated', () => {
    expect(howlFormats(['/audio/x/rain-1.mp3'])).toEqual(['mp3']);
    expect(howlFormats(['/audio/x/rain-1.opus'])).toEqual(['opus']);
    expect(howlFormats(['/audio/_bed/brown.wav'])).toEqual(['wav']);
  });
  it('pairs each src with its own format positionally', () => {
    expect(howlFormats(['/a.opus', '/b.mp3'])).toEqual(['opus', 'mp3']);
  });
  it('ignores a query string / hash on the url', () => {
    expect(howlFormats(['/audio/x/rain-1.opus?v=9'])).toEqual(['opus']);
    expect(howlFormats(['/audio/x/rain-1.mp3#frag'])).toEqual(['mp3']);
  });
});

describe('HowlScene', () => {
  it('creates a synth bed + one looping element per scene element, fading each in', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(5);

    expect(FakeHowl.all).toHaveLength(3); // synth bed + rain + wind
    const bed = bySrc('/_bed/brown');
    const rain = bySrc('rain-1');
    const wind = bySrc('wind-1');
    expect(bed.played).toBe(true);
    expect(rain.played).toBe(true);
    expect(wind.played).toBe(true);
    // Each fades from 0 to its mix level (master 1) over 5000ms.
    expect(rain.fades.at(-1)).toEqual([0, 0.5, 5000]);
    expect(wind.fades.at(-1)).toEqual([0, 0.3, 5000]);
    expect(bed.fades.at(-1)).toEqual([0, 0.1, 5000]); // synth.defaultVolume
  });

  it('does not re-fade from silence if the underlying element replays', () => {
    // A native html5 <audio> element can re-fire 'play' after this layer's
    // first start (OS audio-focus interruption resume, Howler's pooled-
    // element reuse). A naive onplay handler would re-run the from-zero
    // fade every time, audible as a sudden dip-then-swell under narration.
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(5);
    const rain = bySrc('rain-1');
    expect(rain.fades).toHaveLength(1);
    expect(rain.fades[0]).toEqual([0, 0.5, 5000]);

    rain.play(); // simulate a spurious replay of the same element

    // No second fade-from-zero: the volume is just re-asserted directly.
    expect(rain.fades).toHaveLength(1);
    expect(rain.volume()).toBe(0.5);
  });

  it('re-enters a running sleep-timer fade on replay instead of snapping loud (O1)', () => {
    // The sleep timer starts a long fade-to-silence; partway through, the OS
    // re-fires 'play' on the element (lock-screen resume / audio-focus
    // return). The layer must keep heading to silence over the remaining
    // time, NOT snap back to full mix (which cancels the fade, then hard-cuts
    // when the timer's stop lands) — directly against "let me stay asleep".
    vi.useFakeTimers();
    try {
      const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
      scene.start(0); // no fade-in; rain sits at its 0.5 mix level
      const rain = bySrc('rain-1');
      expect(rain.vol).toBe(0.5);

      scene.fadeToSilence(90); // sleep timer fires: 90s ramp to 0
      expect(rain.fades.at(-1)).toEqual([0.5, 0, 90_000]);
      expect(rain.fadeActive).toBe(true);

      vi.advanceTimersByTime(30_000); // 30s in, 60s of fade left
      rain.play(); // spurious replay mid-fade

      // Fixed behaviour: a fresh fade toward 0 over the REMAINING wall time,
      // and no volume() snap to full mix.
      expect(rain.fadeActive).toBe(true); // the fade was NOT cancelled
      expect(rain.volume()).toBe(0); // still heading to silence, not 0.5
      const last = rain.fades.at(-1)!;
      expect(last[1]).toBe(0); // target silence
      expect(last[2]).toBe(60_000); // remaining wall time, not the full 90s
    } finally {
      vi.useRealTimers();
    }
  });

  it('an outer-gain change mid-fade does not cancel the sleep-timer fade (O1)', () => {
    // Night Drift lowers the scene gain via setMaster while the sleep-timer
    // fade is running. setOuter must not call volume() (which would cancel
    // the fade); it records the new multiplier for a later restore() instead.
    vi.useFakeTimers();
    try {
      const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
      scene.start(0);
      const rain = bySrc('rain-1');
      scene.fadeToSilence(90);
      expect(rain.fadeActive).toBe(true);

      scene.setMaster(0.5); // Night Drift gain change mid-fade
      expect(rain.fadeActive).toBe(true); // still fading to silence
      expect(rain.vol).toBe(0); // not snapped to 0.5*0.5 = 0.25
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays the synth-bed carrier from the scene color', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    const bedLayer = scene.getLayers().find((l) => l.id === 'test-scene:synth-bed');
    expect(bedLayer).toBeDefined();
    expect(bedLayer!.label).toBe('Synth bed');
    expect(bySrc('/_bed/brown')).toBeDefined();
  });

  it('scales every layer by the master volume', () => {
    const scene = new HowlScene(makeDef(), 0.5, fakeFactory, firstVariant);
    scene.start(0);
    const rain = bySrc('rain-1');
    // 0.5 mix * 0.5 master = 0.25.
    expect(rain.vol).toBeCloseTo(0.25, 5);

    scene.setMaster(1);
    expect(rain.vol).toBeCloseTo(0.5, 5);
  });

  it('applies a reduced scene gain (deep-night resume) on top of master', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0, 0.6); // deep-night target
    const rain = bySrc('rain-1');
    // 0.5 mix * 1 master * 0.6 sceneGain = 0.30.
    expect(rain.vol).toBeCloseTo(0.3, 5);
  });

  it('setLayerVolume retargets a single layer', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0);
    scene.setLayerVolume('test-scene:rain', 0.8);
    const rain = bySrc('rain-1');
    const wind = bySrc('wind-1');
    expect(rain.vol).toBeCloseTo(0.8, 5);
    expect(wind.vol).toBeCloseTo(0.3, 5); // untouched
    const rainLayer = scene.getLayers().find((l) => l.id === 'test-scene:rain')!;
    expect(rainLayer.getVolume()).toBeCloseTo(0.8, 5);
  });

  it('fadeToSilence ramps every layer to 0', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0);
    scene.fadeToSilence(90);
    for (const h of FakeHowl.all) {
      expect(h.fades.at(-1)![1]).toBe(0);
      expect(h.fades.at(-1)![2]).toBe(90_000);
    }
  });

  it('dispose stops and unloads every element', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0);
    scene.dispose();
    expect(scene.isDisposed()).toBe(true);
    for (const h of FakeHowl.all) {
      expect(h.stopped).toBe(true);
      expect(h.unloaded).toBe(true);
    }
  });

  it('pause/resume drive the underlying elements', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0);
    scene.pause();
    expect(FakeHowl.all.every((h) => h.paused)).toBe(true);
    scene.resume();
    expect(FakeHowl.all.every((h) => !h.paused)).toBe(true);
  });
});

describe('HowlScenePlayer', () => {
  it('starts a scene and exposes it via getCurrentScene', async () => {
    const player = new HowlScenePlayer(fakeFactory);
    const scene = await player.startScene(makeDef(), { firstFadeSeconds: 0 });
    expect(player.getCurrentScene()).toBe(scene);
    expect(FakeHowl.all).toHaveLength(3); // synth bed + 2 elements
  });

  it('crossfades to a new scene, fading out the old one', async () => {
    const player = new HowlScenePlayer(fakeFactory);
    await player.startScene(makeDef({ id: 'a' }), { firstFadeSeconds: 0 });
    const outgoing = FakeHowl.all.slice();
    const incoming = await player.startScene(makeDef({ id: 'b' }), {
      fadeSeconds: 8,
    });
    expect(player.getCurrentScene()).toBe(incoming);
    // Outgoing elements get a fade-to-0.
    for (const h of outgoing) expect(h.fades.at(-1)![1]).toBe(0);
  });

  it('arms the session sleep timer when requested', async () => {
    const player = new HowlScenePlayer(fakeFactory);
    await player.startScene(makeDef(), {
      firstFadeSeconds: 0,
      sleepTimerMinutes: 30,
    });
    expect(player.sleepTimer.getState().status).toBe('running');
  });

  it('master volume change propagates to the live scene', async () => {
    const player = new HowlScenePlayer(fakeFactory);
    await player.startScene(makeDef(), { firstFadeSeconds: 0 });
    player.setMasterVolume(0.5);
    const rain = bySrc('rain-1');
    expect(rain.vol).toBeCloseTo(0.25, 5); // 0.5 mix * 0.5 master
  });

  it('stopScene fades out, clears current, and resets the timer', async () => {
    vi.useFakeTimers();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef(), {
        firstFadeSeconds: 0,
        sleepTimerMinutes: 30,
      });
      player.stopScene(5);
      expect(player.getCurrentScene()).toBeNull();
      expect(player.sleepTimer.getState().status).toBe('off');
      // Disposal is deferred past the fade; advance to flush it.
      vi.advanceTimersByTime(6_000);
      expect(FakeHowl.all.every((h) => h.unloaded)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the singleton survives re-imports', () => {
    __resetHowlScenePlayerForTests();
    // Two getHowlScenePlayer() calls return the same instance — covered by
    // the accessor; here we just confirm the reset seam works without throw.
    expect(() => __resetHowlScenePlayerForTests()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Session ownership — the 2026-09-10 review's top findings. The invariant
// under test is CLAUDE.md's: overnight protections belong to the session and
// must survive both a re-pick of the live scene and an automatic Night Drift.

/** Minimal navigator.mediaSession + MediaMetadata stand-in (jsdom has
 *  neither), mirroring the helper in SceneCoordinator.test.ts. */
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

/** The last-created fake Howl for a src — after a crossfade there are two
 *  elements per url, and the incoming scene's is the later one. */
const lastBySrc = (sub: string): FakeHowl =>
  FakeHowl.all.filter((h) => h.opts.src.some((s) => s.includes(sub))).at(-1)!;

describe('HowlScenePlayer — re-picking the scene that is already playing', () => {
  it('adopts the live scene instead of crossfading it against itself', async () => {
    const player = new HowlScenePlayer(fakeFactory);
    const first = await player.startScene(makeDef(), { firstFadeSeconds: 0 });
    const built = FakeHowl.all.length;

    const again = await player.startScene(makeDef(), { firstFadeSeconds: 0 });

    expect(again).toBe(first);
    // No second <audio> element per layer (which would sum to ~+6 dB with
    // comb filtering, and take two more out of Howler's pool of ten)...
    expect(FakeHowl.all).toHaveLength(built);
    // ...and nothing was faded out from under the user.
    expect(FakeHowl.all.some((h) => h.fades.at(-1)?.[1] === 0)).toBe(false);
    expect(FakeHowl.all.every((h) => !h.stopped)).toBe(true);
  });

  it('keeps the armed countdown instead of re-arming the default', async () => {
    vi.useFakeTimers();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef(), {
        firstFadeSeconds: 0,
        sleepTimerMinutes: 60,
      });
      const endsAt = player.sleepTimer.getState().endsAt;
      vi.advanceTimersByTime(10 * 60_000);

      // Tonight passes the *default* timer on every pick, so a re-pick used
      // to restart the countdown from 60 minutes (review bug H3's symptom:
      // a confirmed "Stops in 49:58" jumping back to 59:59).
      await player.startScene(makeDef(), {
        firstFadeSeconds: 0,
        sleepTimerMinutes: 60,
      });

      expect(player.sleepTimer.getState().status).toBe('running');
      expect(player.sleepTimer.getState().endsAt).toBe(endsAt);
      expect(Math.round(player.sleepTimer.getRemainingMs() / 60_000)).toBe(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels an in-flight sleep-timer fade rather than adopting a dying scene', async () => {
    vi.useFakeTimers();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef(), {
        firstFadeSeconds: 0,
        sleepTimerMinutes: 0.02,
      });
      vi.advanceTimersByTime(1500); // past the deadline → fading to silence
      expect(player.sleepTimer.getState().status).toBe('fading');
      const rain = lastBySrc('rain-1');
      expect(rain.fades.at(-1)![1]).toBe(0);

      // The user re-taps the scene: "I'm still awake."
      await player.startScene(makeDef(), {
        firstFadeSeconds: 0,
        sleepTimerMinutes: 60,
      });

      expect(player.sleepTimer.getState().status).toBe('running');
      // Ramping back to its mix level, not still heading to silence.
      expect(rain.fades.at(-1)![1]).toBeCloseTo(0.5, 5);
      // ...and the old fade-exit can't stop the adopted scene behind it.
      vi.advanceTimersByTime(95_000);
      expect(player.getCurrentScene()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still resets the timer on a user switch to a different scene (H1)', async () => {
    vi.useFakeTimers();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef({ id: 'a' }), {
        firstFadeSeconds: 0,
        sleepTimerMinutes: 0.02,
      });
      vi.advanceTimersByTime(1500);
      expect(player.sleepTimer.getState().status).toBe('fading');

      await player.startScene(makeDef({ id: 'b' }), { fadeSeconds: 1 });

      expect(player.sleepTimer.getState().status).toBe('off');
      expect(player.sleepTimer.isArmed).toBe(false);
      vi.advanceTimersByTime(95_000);
      expect(player.getCurrentScene()?.id).toBe('b');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('HowlScenePlayer — Night Drift carries the session forward', () => {
  it('keeps the armed countdown and the reduced scene gain across the drift', async () => {
    vi.useFakeTimers();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      const target = makeDef({ id: 'night' });
      player.setSceneResolver((id) =>
        Promise.resolve(id === 'night' ? target : null)
      );
      await player.startScene(
        makeDef({
          id: 'evening',
          driftsTo: { sceneId: 'night', afterMinutes: 0.02, crossfadeSeconds: 1 },
        }),
        {
          firstFadeSeconds: 0,
          firstFadeTarget: 0.6, // a 3 a.m. Door resume
          sleepTimerMinutes: 60,
        }
      );
      const endsAt = player.sleepTimer.getState().endsAt;

      await vi.advanceTimersByTimeAsync(1300);

      expect(player.getCurrentScene()?.id).toBe('night');
      // The countdown is the whole point: a drift is an automatic
      // continuation of the same night, not a user scene switch.
      expect(player.sleepTimer.getState().status).toBe('running');
      expect(player.sleepTimer.getState().endsAt).toBe(endsAt);
      // The deep-night gain reduction survives too (0.5 mix × 0.6 gain).
      expect(lastBySrc('rain-1').fades.at(-1)![1]).toBeCloseTo(0.3, 5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stands down when the sleep timer is already fading the night out', async () => {
    vi.useFakeTimers();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      player.setSceneResolver(() => Promise.resolve(makeDef({ id: 'night' })));
      await player.startScene(
        makeDef({
          id: 'evening',
          driftsTo: { sceneId: 'night', afterMinutes: 0.04 },
        }),
        { firstFadeSeconds: 0, sleepTimerMinutes: 0.02 }
      );

      await vi.advanceTimersByTimeAsync(1500); // timer fires first → fading
      expect(player.sleepTimer.getState().status).toBe('fading');
      await vi.advanceTimersByTimeAsync(1500); // past the drift deadline

      // A fresh scene here would come up at full level and then be hard-cut
      // by the pending fade-exit.
      expect(player.getCurrentScene()?.id).toBe('evening');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('HowlScene — snapshot for debug markers', () => {
  it('reports each layer with its file, loop period and live position', () => {
    const scene = new HowlScene(makeDef(), 0.8, fakeFactory, firstVariant);
    scene.start(0);
    bySrc('rain-1').seekValue = 12.5;
    bySrc('wind-1').seekValue = 400;
    bySrc('brown').seekValue = 800;

    const snap = scene.snapshot();

    expect(snap.map((l) => l.id)).toEqual([
      'test-scene:synth-bed',
      'test-scene:rain',
      'test-scene:wind',
    ]);
    const rain = snap.find((l) => l.id === 'test-scene:rain')!;
    expect(rain.label).toBe('Rain');
    expect(rain.url).toContain('rain-1.mp3');
    expect(rain.periodSeconds).toBe(251);
    expect(rain.seekSeconds).toBe(12.5);
    expect(rain.volume).toBe(0.5);
    expect(rain.outer).toBe(0.8);
    expect(rain.playing).toBe(true);
  });

  it('gives the synth bed its 887s carrier period', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0);
    const bed = scene.snapshot().find((l) => l.id === 'test-scene:synth-bed')!;
    expect(bed.periodSeconds).toBe(SYNTH_BED_LOOP_SECONDS);
    expect(bed.url).toContain('/audio/_bed/brown.opus');
  });

  it('reports a null position rather than guessing when the element cannot be read', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0);
    bySrc('rain-1').seekThrows = true;
    const rain = scene.snapshot().find((l) => l.id === 'test-scene:rain')!;
    expect(rain.seekSeconds).toBeNull();
  });

  it('reports a null position for a layer that never started', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    const rain = scene.snapshot().find((l) => l.id === 'test-scene:rain')!;
    expect(rain.seekSeconds).toBeNull();
    expect(rain.playing).toBe(false);
  });

  it('tracks the saved mix level and the outer gain', () => {
    const scene = new HowlScene(makeDef(), 0.5, fakeFactory, firstVariant, {
      'test-scene:rain': 0.25,
    });
    scene.start(0, 0.6); // a 3 a.m. Door resume
    const rain = scene.snapshot().find((l) => l.id === 'test-scene:rain')!;
    expect(rain.volume).toBe(0.25);
    expect(rain.outer).toBeCloseTo(0.3, 5);
  });
});

describe('HowlScene — saved Mixer levels', () => {
  it('starts a layer at its saved level instead of the scene default', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant, {
      'test-scene:rain': 0.2,
      'test-scene:synth-bed': 0.05,
    });
    scene.start(0);

    // Applied as the initial target, so the fade-in still runs from silence
    // to the saved level — not set afterwards, which would cancel the fade.
    expect(bySrc('rain-1').fades.at(-1)).toEqual([0, 0.2, 0]);
    expect(bySrc('brown').fades.at(-1)).toEqual([0, 0.05, 0]);
    // Untouched layers keep the scene JSON's voicing.
    expect(bySrc('wind-1').fades.at(-1)).toEqual([0, 0.3, 0]);
  });

  it('ignores a saved level for a layer that is not in this scene', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant, {
      'other-scene:rain': 0.01,
    });
    scene.start(0);
    expect(bySrc('rain-1').fades.at(-1)).toEqual([0, 0.5, 0]);
  });

  it('ignores a corrupt saved level', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant, {
      'test-scene:rain': Number.NaN,
    } as Record<string, number>);
    scene.start(0);
    expect(bySrc('rain-1').fades.at(-1)).toEqual([0, 0.5, 0]);
  });

  it('clamps a saved level that is out of range', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant, {
      'test-scene:rain': 3,
    });
    scene.start(0);
    expect(bySrc('rain-1').fades.at(-1)).toEqual([0, 1, 0]);
  });
});

describe('HowlScene — resume() must not stack a second element', () => {
  it('is a no-op on a layer that is already playing', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0);
    const built = FakeHowl.all.length;
    const rain = bySrc('rain-1');
    expect(rain.playing()).toBe(true);
    const playsBefore = rain.playCalls;

    // The OS fires play on an already-playing session freely — a
    // lock-screen tap, a headset button, an audio-focus return.
    scene.resume();

    expect(rain.playCalls).toBe(playsBefore);
    expect(FakeHowl.all).toHaveLength(built);
  });

  it('still resumes a layer that was paused', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0);
    const rain = bySrc('rain-1');
    scene.pause();
    expect(rain.playing()).toBe(false);
    const playsBefore = rain.playCalls;

    scene.resume();

    expect(rain.playCalls).toBe(playsBefore + 1);
    expect(rain.playing()).toBe(true);
  });

  it('does not resume a disposed layer', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0);
    const rain = bySrc('rain-1');
    scene.pause();
    scene.dispose();
    const playsBefore = rain.playCalls;
    scene.resume();
    expect(rain.playCalls).toBe(playsBefore);
  });
});

describe('HowlScenePlayer — media-session ownership is not write-once', () => {
  it('gives up ownership when a bed starts for a screen that owns the session', async () => {
    const media = installMediaSessionMock();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      // A Tonight scene: the session stamps the OS media session itself.
      await player.startScene(makeDef({ id: 'tonight', label: 'Tonight' }), {
        firstFadeSeconds: 0,
      });
      expect((media.session.metadata as { title: string }).title).toBe('Tonight');

      // The user opens a story whose bed is a different scene. The content
      // player owns the OS session for the narration from here.
      await player.startScene(makeDef({ id: 'bed', label: 'Bed' }), {
        fadeSeconds: 0,
        manageMediaSession: false,
      });
      media.session.metadata = { title: 'A story' };

      // The story's bed is told to stop. With the old write-once flag the
      // session still believed it owned the OS session and wiped the
      // narration's metadata + transport here, mid-story.
      player.stopScene(0);

      expect((media.session.metadata as { title: string }).title).toBe('A story');
    } finally {
      media.restore();
    }
  });

  it('still clears the session it does own', async () => {
    const media = installMediaSessionMock();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef({ label: 'Mine' }), { firstFadeSeconds: 0 });
      expect((media.session.metadata as { title: string }).title).toBe('Mine');
      player.stopScene(0);
      expect(media.session.metadata).toBeNull();
    } finally {
      media.restore();
    }
  });
});

describe('HowlScenePlayer — media-session hand-back', () => {
  it('claims the OS session for a bed the content player left playing', async () => {
    const media = installMediaSessionMock();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      // How the content player starts a story's bed: it owns the OS session
      // for the narration, so the bed must not stamp its own label.
      await player.startScene(makeDef({ id: 'bed', label: 'Bed Scene' }), {
        firstFadeSeconds: 0,
        manageMediaSession: false,
      });
      expect(media.session.metadata).toBeNull();

      // The user backs out to the Library; the bed plays on all night, so
      // the session is handed back here instead of being cleared.
      player.claimMediaSession();

      expect((media.session.metadata as { title: string }).title).toBe('Bed Scene');
      expect(media.session.playbackState).toBe('playing');
      expect(typeof media.handlers.stop).toBe('function');

      // And it now tears down with the scene, as any session-owned scene does.
      player.stopScene(0);
      expect(media.session.metadata).toBeNull();
      expect(media.session.playbackState).toBe('none');

      // No-op with nothing playing.
      player.claimMediaSession();
      expect(media.session.metadata).toBeNull();
    } finally {
      media.restore();
    }
  });
});

describe('HowlScenePlayer — debug markers', () => {
  it('records what every layer was playing and where it was', async () => {
    const player = new HowlScenePlayer(fakeFactory);
    await player.startScene(makeDef(), { firstFadeSeconds: 0 });
    player.setMasterVolume(0.4);
    lastBySrc('rain-1').seekValue = 248;
    lastBySrc('wind-1').seekValue = 100;

    const marker = player.markMoment('nightstand')!;

    expect(marker.sceneId).toBe('test-scene');
    expect(marker.sceneLabel).toBe('Test Scene');
    expect(marker.trigger).toBe('nightstand');
    expect(marker.masterVolume).toBe(0.4);
    const rain = marker.layers.find((l) => l.id === 'test-scene:rain')!;
    expect(rain.seekSeconds).toBe(248);
    expect(rain.periodSeconds).toBe(251);
    expect(rain.url).toContain('rain-1.mp3');
    // 248s into a 251s loop: 3s from the wrap, which is the whole point.
    expect(seamSuspects(marker).map((l) => l.id)).toEqual(['test-scene:rain']);
    expect(getMarkers()).toHaveLength(1);
  });

  it('returns null with nothing playing, and takes no marker', async () => {
    const player = new HowlScenePlayer(fakeFactory);
    expect(player.markMoment('media-key')).toBeNull();

    await player.startScene(makeDef(), { firstFadeSeconds: 0 });
    player.stopScene(0);
    expect(player.markMoment('media-key')).toBeNull();
    expect(getMarkers()).toEqual([]);
  });

  it('measures elapsed from the scene start, across a screen exit', async () => {
    vi.useFakeTimers();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef(), { firstFadeSeconds: 0 });
      vi.advanceTimersByTime(90 * 60_000);

      // The Player was exited and re-entered in between — an adoption, which
      // must not restart the clock the marker reports against.
      await player.startScene(makeDef(), { firstFadeSeconds: 0 });
      const marker = player.markMoment('lush')!;

      expect(Math.round(marker.elapsedMs / 60_000)).toBe(90);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts the clock when a drift builds a fresh scene', async () => {
    vi.useFakeTimers();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      player.setSceneResolver(() => Promise.resolve(makeDef({ id: 'night' })));
      await player.startScene(
        makeDef({ id: 'evening', driftsTo: { sceneId: 'night', afterMinutes: 30 } }),
        { firstFadeSeconds: 0 }
      );
      await vi.advanceTimersByTimeAsync(30 * 60_000 + 100);
      expect(player.getCurrentScene()?.id).toBe('night');

      await vi.advanceTimersByTimeAsync(5 * 60_000);
      const marker = player.markMoment('lush')!;

      // The drifted-in layers are new elements that started at the drift,
      // so "5 minutes in" is what locates their audio, not 35.
      expect(Math.round(marker.elapsedMs / 60_000)).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('records the live sleep-timer state with the marker', async () => {
    const player = new HowlScenePlayer(fakeFactory);
    await player.startScene(makeDef(), {
      firstFadeSeconds: 0,
      sleepTimerMinutes: 60,
    });
    expect(player.markMoment('lush')!.timerStatus).toBe('running');
  });
});

describe('HowlScenePlayer — media-key marker trigger', () => {
  it('offers no next-track button while the setting is off', async () => {
    const media = installMediaSessionMock();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef(), { firstFadeSeconds: 0 });
      expect(media.handlers.nexttrack).toBeNull();
    } finally {
      media.restore();
    }
  });

  it('takes a marker when the OS fires next-track', async () => {
    const media = installMediaSessionMock();
    try {
      setSetting('debugMarkers', true);
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef(), { firstFadeSeconds: 0 });

      expect(typeof media.handlers.nexttrack).toBe('function');
      (media.handlers.nexttrack as () => void)();

      expect(getMarkers()).toHaveLength(1);
      expect(getMarkers()[0]!.trigger).toBe('media-key');
    } finally {
      media.restore();
    }
  });

  it('adds and removes the button when the setting is toggled mid-scene', async () => {
    const media = installMediaSessionMock();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef(), { firstFadeSeconds: 0 });
      expect(media.handlers.nexttrack).toBeNull();

      setSetting('debugMarkers', true);
      player.refreshMediaSessionActions();
      expect(typeof media.handlers.nexttrack).toBe('function');

      setSetting('debugMarkers', false);
      player.refreshMediaSessionActions();
      expect(media.handlers.nexttrack).toBeNull();
    } finally {
      media.restore();
    }
  });

  it('does not steal the session back when another screen owns it', async () => {
    const media = installMediaSessionMock();
    try {
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef(), {
        firstFadeSeconds: 0,
        manageMediaSession: false,
      });
      media.session.metadata = { title: 'A story' };

      setSetting('debugMarkers', true);
      player.refreshMediaSessionActions();

      expect((media.session.metadata as { title: string }).title).toBe('A story');
    } finally {
      media.restore();
    }
  });

  it('clears the next-track handler when the scene stops', async () => {
    const media = installMediaSessionMock();
    try {
      setSetting('debugMarkers', true);
      const player = new HowlScenePlayer(fakeFactory);
      await player.startScene(makeDef(), { firstFadeSeconds: 0 });
      expect(typeof media.handlers.nexttrack).toBe('function');

      player.stopScene(0);

      expect(media.handlers.nexttrack).toBeNull();
    } finally {
      media.restore();
    }
  });
});

describe('applyNativeLoop — the element loops itself, not Howler', () => {
  const fakeHowl = (nodes: Array<{ loop?: boolean } | undefined>) => {
    const looped: boolean[] = [];
    return {
      howl: {
        _sounds: nodes.map((n) => (n === undefined ? {} : { _node: n })),
        loop: (on: boolean) => {
          looped.push(on);
          return null;
        },
      },
      looped,
    };
  };

  it('engages looping on every element, not just the first', () => {
    // Any element left looping goes back into Howler's shared pool still
    // looping, and the next sound to borrow it inherits that — which could
    // be a story's narration, repeating until morning.
    const a = { loop: false };
    const b = { loop: false };
    const { howl } = fakeHowl([a, b]);
    expect(applyNativeLoop(howl, true)).toBe(true);
    expect([a.loop, b.loop]).toEqual([true, true]);
  });

  it('releases looping on every element', () => {
    const a = { loop: true };
    const b = { loop: true };
    const { howl } = fakeHowl([a, b]);
    expect(applyNativeLoop(howl, false)).toBe(true);
    expect([a.loop, b.loop]).toEqual([false, false]);
  });

  it('reports failure when the elements cannot be reached', () => {
    // A future Howler could rename its internals; the caller falls back to
    // Howler's own loop rather than leaving a layer that stops after one
    // period.
    expect(applyNativeLoop({ _sounds: [], loop: () => null }, true)).toBe(false);
    expect(
      applyNativeLoop({ loop: () => null } as never, true)
    ).toBe(false);
    expect(applyNativeLoop({ _sounds: [undefined], loop: () => null } as never, true)).toBe(
      false
    );
  });

  it('skips a sound with no element but still handles its siblings', () => {
    const b = { loop: false };
    const { howl } = fakeHowl([undefined, b]);
    expect(applyNativeLoop(howl, true)).toBe(true);
    expect(b.loop).toBe(true);
  });
});
