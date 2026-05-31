// SceneCoordinator — loads scene definitions, instantiates Scenes, and
// runs the 8-second cross-scene overlapping fade from the brief (§3.5).
//
// What loadScene does:
//   1. Ensure the noise-worklet is loaded (the synth bed and tinnitus
//      mask layers depend on it).
//   2. Fetch + decode every variant URL referenced by the definition.
//      If a fetch or decode fails AND options.fallbackToSynthetic is
//      true, substitute a synthesized placeholder buffer so dev work
//      can proceed before real recordings are dropped in. This is the
//      paved road during Phase 2: define scenes now, drop in George
//      Vlad recordings later, no code changes needed.
//   3. Construct NoiseGenerator + (optional) TinnitusMaskLayer +
//      one FileLayer per element.
//   4. Wrap them in a Scene.
//
// The crossfadeTo() method overlaps the incoming scene's fade-in with
// the outgoing scene's fade-out by sharing a single duration. Both
// run on the AudioContext clock so the overlap is sample-accurate.

import { AudioEngine } from './AudioEngine';
import { AudioLoadError, FileLayer, loadAudioBuffer } from './FileLayer';
import type { AudioVariant } from './FileLayer';
import { NoiseGenerator } from './NoiseGenerator';
import { TinnitusMaskLayer } from './TinnitusMaskLayer';
import { Scene } from './Scene';
import { resolvePublicUrl } from '../lib/baseUrl';
import { generateTestPadBuffer } from './synth/testPad';
import type {
  SceneDefinition,
  SceneElementDefinition,
  SceneVariantDefinition,
} from './sceneFormat';
import type { Layer } from './types';

/** Default cross-scene fade per §3.5 of the brief. */
export const DEFAULT_SCENE_CROSSFADE_SECONDS = 8;
/** Default first-start fade-in (no outgoing partner — gentler than 8s). */
export const DEFAULT_SCENE_FIRST_START_SECONDS = 5;

export interface LoadSceneOptions {
  /**
   * Override the user's tinnitus settings for this load. Useful when the
   * scene definition includes a tinnitus mask but the caller wants to
   * pin the centerHz / bandwidthHz to the user's calibrated values.
   */
  tinnitus?: { centerHz: number; bandwidthHz: number };
  /**
   * If a variant URL fails to fetch/decode, generate a synthesized
   * placeholder buffer instead of throwing. Default: true (Phase 2 dev
   * convenience — author scenes before sourcing audio). Set false in
   * production builds once recordings exist.
   */
  fallbackToSynthetic?: boolean;
  /**
   * Optional: report each variant's load outcome, for diagnostic UI.
   */
  onVariantLoaded?: (info: VariantLoadOutcome) => void;
}

export interface VariantLoadOutcome {
  elementId: string;
  variantId: string;
  url: string;
  status: 'loaded' | 'fallback-synthetic' | 'failed';
  error?: unknown;
}

export class SceneCoordinator {
  private readonly engine: AudioEngine;
  private currentScene: Scene | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  getCurrentScene(): Scene | null {
    return this.currentScene;
  }

  /**
   * Build a Scene from its definition, decoding all required audio
   * buffers along the way. Does NOT start the scene or connect it to
   * the bus — call startScene() / crossfadeTo() for that.
   */
  async loadScene(
    definition: SceneDefinition,
    options: LoadSceneOptions = {}
  ): Promise<Scene> {
    const fallback = options.fallbackToSynthetic ?? true;

    // The synth bed and tinnitus mask need the noise-processor worklet.
    if (definition.synth || definition.tinnitus) {
      await this.engine.loadNoiseWorklet();
    }

    const layers: Layer[] = [];

    // 1) Synth bed.
    if (definition.synth) {
      const synth = new NoiseGenerator(this.engine, {
        id: `${definition.id}:synth-bed`,
        label: 'Synth bed',
        color: definition.synth.color,
        defaultVolume: definition.synth.defaultVolume,
      });
      layers.push(synth);
    }

    // 2) Tinnitus mask, if the scene declares it on by default. (The
    //    user can still toggle it off elsewhere.)
    if (definition.tinnitus?.enabledByDefault) {
      const tinnitus = new TinnitusMaskLayer(this.engine, {
        id: `${definition.id}:tinnitus-mask`,
        label: 'Tinnitus mask',
        centerHz: options.tinnitus?.centerHz,
        bandwidthHz: options.tinnitus?.bandwidthHz,
        defaultVolume: definition.tinnitus.defaultVolume,
      });
      layers.push(tinnitus);
    }

    // 3) Element layers — one FileLayer per element, all variants
    //    decoded eagerly per §3.5 ("audio files preloaded before the
    //    scene starts playing").
    for (const element of definition.elements) {
      const variants = await this.loadElementVariants(element, fallback, options.onVariantLoaded);
      const fileLayer = new FileLayer(this.engine, {
        id: `${definition.id}:${element.id}`,
        label: element.label,
        variants,
        crossfadeSeconds: element.crossfadeSeconds,
        defaultVolume: element.defaultVolume,
        variantRotation: element.variantRotation,
      });
      layers.push(fileLayer);
    }

    return new Scene(this.engine, {
      id: definition.id,
      definition,
      layers,
    });
  }

  /**
   * Start a scene. If another scene is already current, cross-fades
   * between them over `fadeSeconds` (default 8). Otherwise fades the
   * scene up from silence over `firstFadeSeconds` (default 5).
   */
  async startScene(
    definition: SceneDefinition,
    options: LoadSceneOptions & {
      fadeSeconds?: number;
      firstFadeSeconds?: number;
    } = {}
  ): Promise<Scene> {
    if (this.currentScene && !this.currentScene.isDisposed()) {
      return this.crossfadeTo(definition, options);
    }
    const scene = await this.loadScene(definition, options);
    scene.output.connect(this.engine.bus.input);
    scene.start();
    // First start from silence uses the front-loaded 'ease-out' curve so
    // the scene becomes audible quickly. Cross-scene fades (crossfadeTo)
    // keep the linear ramp, which pairs with the outgoing fade-out.
    scene.fadeIn(
      options.firstFadeSeconds ?? DEFAULT_SCENE_FIRST_START_SECONDS,
      1.0,
      'ease-out'
    );
    this.currentScene = scene;
    return scene;
  }

  /**
   * Cross-fade from the current scene to a new one. The outgoing
   * scene's fade-out and the incoming scene's fade-in run on the same
   * AudioContext clock, so they overlap exactly. The outgoing scene
   * is freed in a fire-and-forget tail once its ramp completes.
   */
  async crossfadeTo(
    definition: SceneDefinition,
    options: LoadSceneOptions & { fadeSeconds?: number } = {}
  ): Promise<Scene> {
    const fade = options.fadeSeconds ?? DEFAULT_SCENE_CROSSFADE_SECONDS;
    const outgoing = this.currentScene;
    const incoming = await this.loadScene(definition, options);

    incoming.output.connect(this.engine.bus.input);
    incoming.start();
    incoming.fadeIn(fade);

    if (outgoing && !outgoing.isDisposed()) {
      outgoing.fadeAndDispose(fade);
    }

    this.currentScene = incoming;
    return incoming;
  }

  /**
   * Stop the current scene with a fade-out. Returns immediately —
   * teardown is asynchronous via fadeAndDispose. To wait for the fade
   * to fully complete, await `waitForDisposal(fadeSeconds)`.
   */
  stopScene(fadeSeconds = DEFAULT_SCENE_FIRST_START_SECONDS): void {
    if (!this.currentScene) return;
    this.currentScene.fadeAndDispose(fadeSeconds);
    this.currentScene = null;
  }

  // ---------------------------------------------------------------------
  // Internal helpers

  private async loadElementVariants(
    element: SceneElementDefinition,
    fallback: boolean,
    onLoaded?: (info: VariantLoadOutcome) => void
  ): Promise<AudioVariant[]> {
    if (element.variants.length === 0) {
      throw new Error(
        `Scene element "${element.id}" has no variants — every element ` +
          `needs at least one recording.`
      );
    }
    const out: AudioVariant[] = [];
    // Decode in parallel — file decode is the slow part and we don't
    // want a 6-element scene to load serially.
    const results = await Promise.all(
      element.variants.map((variant) =>
        this.loadVariant(element, variant, fallback, onLoaded)
      )
    );
    for (const result of results) out.push(result);
    return out;
  }

  private async loadVariant(
    element: SceneElementDefinition,
    variant: SceneVariantDefinition,
    fallback: boolean,
    onLoaded?: (info: VariantLoadOutcome) => void
  ): Promise<AudioVariant> {
    const ctx = this.engine.context;
    // Scene JSONs store URLs as site-root paths ("/audio/forest/wind.mp3");
    // resolvePublicUrl prepends the deploy base so the same JSON works at
    // '/' in dev and '/SleepApp/' on GitHub Pages. Without this, every
    // variant 404s on the public deploy, the engine silently falls back to
    // a synthesized pad, and the scene takes a long time to "load".
    const resolvedUrl = resolvePublicUrl(variant.url);
    try {
      const buffer = await loadAudioBuffer(ctx, resolvedUrl);
      onLoaded?.({
        elementId: element.id,
        variantId: variant.id,
        url: variant.url,
        status: 'loaded',
      });
      return {
        id: variant.id,
        buffer,
        loopOffsetSeconds: element.loopOffsetSeconds,
      };
    } catch (err) {
      // Synthesized fallback is only safe for the "intentional dev
      // convenience" case: the JSON references a file that doesn't
      // exist yet because the scene is being authored before its
      // recordings land in /public/audio/. A 404 is the marker for
      // that case. Anything else (real network failure, decode error,
      // 5xx) is a genuine problem — silently substituting a synth pad
      // would hide it. The original error is rethrown intact so
      // diagnostics keep the cause chain.
      const isDevSubstitutable =
        fallback && err instanceof AudioLoadError && err.kind === 'not-found';
      if (!isDevSubstitutable) {
        onLoaded?.({
          elementId: element.id,
          variantId: variant.id,
          url: variant.url,
          status: 'failed',
          error: err,
        });
        throw err;
      }
      // Synthesize a buffer long enough to satisfy the FileLayer's
      // "duration > loopOffset + crossfade" sanity check. We add 12s
      // headroom so any reasonable crossfadeSeconds is covered.
      const crossfadeSeconds = element.crossfadeSeconds ?? 5;
      const duration = element.loopOffsetSeconds + crossfadeSeconds + 12;
      // Vary the fundamental per element id so each scene's spectrum
      // is at least visually distinct.
      const fundamentalHz = 90 + (hashString(element.id) % 220);
      const buffer = generateTestPadBuffer(ctx, duration, fundamentalHz);
      onLoaded?.({
        elementId: element.id,
        variantId: variant.id,
        url: variant.url,
        status: 'fallback-synthetic',
        error: err,
      });
      return {
        id: variant.id,
        buffer,
        loopOffsetSeconds: element.loopOffsetSeconds,
      };
    }
  }
}

/** Tiny stable hash so synthesized fallbacks differ per element id. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

let coordinator: SceneCoordinator | null = null;

/**
 * Singleton accessor mirroring getAudioEngine(). The engine reference
 * is captured on first call so re-imports across the React tree see
 * the same instance.
 */
export function getSceneCoordinator(engine: AudioEngine): SceneCoordinator {
  if (!coordinator) coordinator = new SceneCoordinator(engine);
  return coordinator;
}
