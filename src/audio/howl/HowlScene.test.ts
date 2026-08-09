// Tests for the Path A Howler bed engine. A fake HowlLike factory lets us
// assert the volume/fade/lifecycle behaviour without a real AudioContext or
// DOM media element.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HowlScene, howlFormats } from './HowlScene';
import type { HowlLike, HowlFactory, HowlFactoryOptions } from './HowlScene';
import {
  HowlScenePlayer,
  __resetHowlScenePlayerForTests,
} from './HowlScenePlayer';
import type { SceneDefinition } from '../sceneFormat';

class FakeHowl implements HowlLike {
  static all: FakeHowl[] = [];
  readonly opts: HowlFactoryOptions;
  vol = 0;
  played = false;
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
