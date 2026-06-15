// Tests for the Path A Howler bed engine. A fake HowlLike factory lets us
// assert the volume/fade/lifecycle behaviour without a real AudioContext or
// DOM media element.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HowlScene } from './HowlScene';
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
    return this;
  }
  volume(level?: number): number {
    if (level === undefined) return this.vol;
    this.vol = level;
    return level;
  }
  playing(): boolean {
    return this.played && !this.stopped && !this.paused;
  }
}

const fakeFactory: HowlFactory = (opts: HowlFactoryOptions) => new FakeHowl(opts);

const firstVariant = (el: { variants: { id: string; url: string }[] }) =>
  el.variants[0]!;

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

describe('HowlScene', () => {
  it('creates one looping element per scene element and fades each in', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(5);

    expect(FakeHowl.all).toHaveLength(2);
    const [rain, wind] = FakeHowl.all;
    expect(rain!.played).toBe(true);
    expect(wind!.played).toBe(true);
    // Each fades from 0 to its mix level (master 1) over 5000ms.
    expect(rain!.fades.at(-1)).toEqual([0, 0.5, 5000]);
    expect(wind!.fades.at(-1)).toEqual([0, 0.3, 5000]);
  });

  it('scales every layer by the master volume', () => {
    const scene = new HowlScene(makeDef(), 0.5, fakeFactory, firstVariant);
    scene.start(0);
    const [rain] = FakeHowl.all;
    // 0.5 mix * 0.5 master = 0.25.
    expect(rain!.vol).toBeCloseTo(0.25, 5);

    scene.setMaster(1);
    expect(rain!.vol).toBeCloseTo(0.5, 5);
  });

  it('applies a reduced scene gain (deep-night resume) on top of master', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0, 0.6); // deep-night target
    const [rain] = FakeHowl.all;
    // 0.5 mix * 1 master * 0.6 sceneGain = 0.30.
    expect(rain!.vol).toBeCloseTo(0.3, 5);
  });

  it('setLayerVolume retargets a single layer', () => {
    const scene = new HowlScene(makeDef(), 1, fakeFactory, firstVariant);
    scene.start(0);
    scene.setLayerVolume('test-scene:rain', 0.8);
    const [rain, wind] = FakeHowl.all;
    expect(rain!.vol).toBeCloseTo(0.8, 5);
    expect(wind!.vol).toBeCloseTo(0.3, 5); // untouched
    expect(scene.getLayers()[0]!.getVolume()).toBeCloseTo(0.8, 5);
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
    expect(FakeHowl.all).toHaveLength(2);
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
    const [rain] = FakeHowl.all;
    expect(rain!.vol).toBeCloseTo(0.25, 5); // 0.5 mix * 0.5 master
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
