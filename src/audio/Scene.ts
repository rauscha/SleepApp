// Scene — owns the layers that make up a House Blend and applies a
// scene-level gain envelope.
//
// A Scene is a composite of:
//   - 0–1 synth bed (NoiseGenerator)
//   - 0–1 tinnitus masking layer (TinnitusMaskLayer)
//   - 1+ ambient element layers (FileLayer per the brief §3.3)
//
// All of those connect to the Scene's own GainNode rather than directly
// to the engine's master bus. That gives us a single AudioParam to ramp
// for scene-level cross-fades — the brief's "8s overlapping fade between
// the outgoing scene and the incoming one" (§3.5) becomes a single
// linearRampToValueAtTime on this gain.
//
// Scene does NOT register its layers in AudioEngine's layer registry.
// The registry's soft-cap of 6 is per-scene by construction (synth +
// tinnitus + 4 elements = 6 max), and the cap check happens here.

import type { AudioEngine } from './AudioEngine';
import type { Layer } from './types';
import type { SceneDefinition } from './sceneFormat';

export interface SceneOptions {
  /** Scene id (e.g. 'forest-day'). Echoed from the SceneDefinition. */
  id: string;
  /** The definition this scene was built from — kept for diagnostics + UI. */
  definition: SceneDefinition;
  /** All Layer instances that make up the scene. */
  layers: Layer[];
}

const SCENE_LAYER_CAP = 6;

// First-start fade shape. A pure linear amplitude ramp from silence sits
// below the room-noise floor for the first ~second, long enough that the
// user wonders whether playback even started. Raising the gain on a
// front-loaded curve (pow with exponent < 1) crosses audibility within
// the first ~0.7s, then eases into the target. 1.0 would be linear; lower
// = more front-loaded. Tunable by ear — bump toward 1.0 if the onset
// feels too sudden, toward 0.4 if it still feels slow to arrive.
const FIRST_START_FADE_EXPONENT = 0.6;
const FIRST_START_FADE_CURVE_STEPS = 64;

export class Scene {
  readonly id: string;
  readonly definition: SceneDefinition;
  /** Output of the scene — connect this to engine.bus.input. */
  readonly output: GainNode;

  private readonly ctx: AudioContext;
  private readonly layersById: Map<string, Layer>;
  private readonly orderedLayers: Layer[];
  private playing = false;
  private disposed = false;
  private currentSceneVolume = 0;

  constructor(engine: AudioEngine, opts: SceneOptions) {
    if (opts.layers.length === 0) {
      throw new Error(`Scene "${opts.id}" needs at least one layer.`);
    }
    if (opts.layers.length > SCENE_LAYER_CAP) {
      throw new Error(
        `Scene "${opts.id}" has ${opts.layers.length} layers; soft cap ` +
          `is ${SCENE_LAYER_CAP}. Drop an element to fit within the cap.`
      );
    }
    this.ctx = engine.context;
    this.id = opts.id;
    this.definition = opts.definition;
    this.orderedLayers = [...opts.layers];
    this.layersById = new Map(opts.layers.map((l) => [l.id, l]));
    if (this.layersById.size !== opts.layers.length) {
      throw new Error(`Scene "${opts.id}" has duplicate layer ids.`);
    }

    // Scene starts silent. SceneCoordinator will fade it in once it's
    // wired to the bus.
    this.output = this.ctx.createGain();
    this.output.gain.value = 0;

    // Wire every layer's output into the scene's gain node. This
    // intercepts the path that AudioEngine.addLayer would normally take
    // (layer.output -> bus.input). We bypass the engine's layer
    // registry by design — Scene IS the layer-of-layers.
    for (const layer of this.orderedLayers) {
      try {
        layer.output.disconnect();
      } catch {
        /* not connected yet */
      }
      layer.output.connect(this.output);
    }
  }

  /**
   * Start every owned layer. Idempotent. Layers begin producing audio
   * immediately, but the scene's master gain is still 0 until the
   * caller invokes fadeIn().
   */
  start(): void {
    if (this.disposed) {
      throw new Error(`Scene "${this.id}" has been disposed.`);
    }
    if (this.playing) return;
    this.playing = true;
    for (const layer of this.orderedLayers) {
      layer.start();
    }
  }

  /**
   * Ramp scene-level gain up to `targetVolume` (default 1.0) over
   * `durationSeconds`.
   *
   * `shape` selects the ramp curve:
   *   - 'linear'   — constant-slope ramp. Used for cross-scene fade-ins,
   *     where the outgoing scene is fading out on a matching linear ramp
   *     and the per-layer crossfades carry the "no dip" feel.
   *   - 'ease-out' — front-loaded curve that rises quickly off zero so a
   *     first start from silence becomes audible fast, then eases into
   *     the target. See FIRST_START_FADE_EXPONENT.
   */
  fadeIn(
    durationSeconds: number,
    targetVolume = 1.0,
    shape: 'linear' | 'ease-out' = 'linear'
  ): void {
    const fade = Math.max(0.05, durationSeconds);
    const target = clamp01(targetVolume);
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    if (shape === 'ease-out') {
      const steps = FIRST_START_FADE_CURVE_STEPS;
      const curve = new Float32Array(steps);
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        curve[i] = Math.pow(t, FIRST_START_FADE_EXPONENT) * target;
      }
      this.output.gain.setValueCurveAtTime(curve, now, fade);
    } else {
      this.output.gain.setValueAtTime(this.output.gain.value, now);
      this.output.gain.linearRampToValueAtTime(target, now + fade);
    }
    this.currentSceneVolume = target;
  }

  /**
   * Ramp scene-level gain down to silence over `durationSeconds`.
   * Returns immediately — caller must invoke fadeAndDispose() (or
   * dispose() after waiting) to actually free nodes.
   */
  fadeOut(durationSeconds: number): void {
    const fade = Math.max(0.05, durationSeconds);
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    this.output.gain.linearRampToValueAtTime(0, now + fade);
    this.currentSceneVolume = 0;
  }

  /**
   * Begin scene fade-out and queue full disposal asynchronously.
   * Returns immediately so the caller can run a parallel fadeIn on
   * the incoming scene (the §3.5 cross-scene case).
   */
  fadeAndDispose(durationSeconds: number): void {
    if (this.disposed) return;
    const fade = Math.max(0.05, durationSeconds);
    this.fadeOut(fade);
    // Tell each layer to fade-and-dispose at the same rate. Both fades
    // are now on the AudioContext clock, so there's no race.
    for (const layer of this.orderedLayers) {
      layer.fadeAndDispose(fade);
    }
    setTimeout(() => this.dispose(), (fade + 0.1) * 1000);
  }

  /** Set the scene-level master gain (the same param fadeIn/Out drives). */
  setSceneVolume(value: number): void {
    const v = clamp01(value);
    this.currentSceneVolume = v;
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    this.output.gain.linearRampToValueAtTime(v, now + 0.05);
  }

  getSceneVolume(): number {
    return this.currentSceneVolume;
  }

  /** Mixer support — set the per-layer volume by layer id. */
  setLayerVolume(layerId: string, value: number): void {
    const layer = this.layersById.get(layerId);
    if (!layer) {
      throw new Error(`Scene "${this.id}" has no layer "${layerId}".`);
    }
    layer.setVolume(value);
  }

  getLayer(layerId: string): Layer | undefined {
    return this.layersById.get(layerId);
  }

  getLayers(): readonly Layer[] {
    return this.orderedLayers;
  }

  isPlaying(): boolean {
    return this.playing && !this.disposed;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Free resources. Safe to call directly when no fade is needed
   * (e.g. error path). Prefer fadeAndDispose() for normal teardown.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playing = false;
    for (const layer of this.orderedLayers) {
      try {
        layer.dispose();
      } catch {
        /* noop */
      }
    }
    try {
      this.output.disconnect();
    } catch {
      /* noop */
    }
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
