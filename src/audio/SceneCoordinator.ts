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
import { SleepTimer } from './SleepTimer';
import { recordEvent } from '../diagnostics/lifecycleLog';
import { startSwKeepAlive, stopSwKeepAlive } from '../serviceWorker/keepAlive';
import {
  clearMediaSession,
  setMediaSessionForScene,
  setMediaSessionPlaybackState,
} from './mediaSession';
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
/** Default Night Drift crossfade — very long so the scene change is felt,
 *  not noticed (roadmap 6.2). */
export const DEFAULT_DRIFT_CROSSFADE_SECONDS = 60;

/**
 * Backoff schedule for re-fetching a scene after a mid-night context rebuild
 * (review bug M6). First attempt is immediate; the next two wait for a
 * transient network drop to clear before we give up and drop to the synth
 * bed. Kept short — the user is asleep and silence is the enemy.
 */
const RESTART_RETRY_DELAYS_MS = [0, 1000, 3000];

/**
 * How long after a scene starts to begin decoding its non-first variants in
 * the background. Long enough to clear the startup window (decode/memory
 * contention that used to stutter the first ~10–15s), far shorter than the
 * first rotation (loopOffset >= 251s), so the variants are ready in time.
 */
const DEFERRED_VARIANT_DELAY_MS = 20_000;

/**
 * Gap between successive deferred-variant decodes, so a scene with several
 * elements (forest-evening: 4) spreads its background decodes out instead of
 * doing them all in one stutter-inducing burst. With this gap they finish
 * well before the first rotation (>= 251s).
 */
const DEFERRED_VARIANT_GAP_MS = 12_000;

/** A FileLayer plus the element variants still waiting to be decoded into it. */
interface DeferredVariantLoad {
  fileLayer: FileLayer;
  element: SceneElementDefinition;
  variants: SceneVariantDefinition[];
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortErr(err: unknown): string {
  return String(err instanceof Error ? err.message : err).slice(0, 80);
}

export interface LoadSceneOptions {
  /**
   * Override the user's tinnitus settings for this load. Useful when the
   * scene definition includes a tinnitus mask but the caller wants to
   * pin the centerHz / bandwidthHz to the user's calibrated values.
   */
  tinnitus?: { centerHz: number; bandwidthHz: number };
  /**
   * If a variant URL fails to fetch/decode (404 only — see loadVariant),
   * generate a synthesized placeholder buffer instead of throwing. This is
   * a DEV affordance for authoring scenes before their audio lands.
   * Default: `import.meta.env.DEV` — in production a missing file must fail
   * loudly (the Player surfaces an error) rather than impersonate the scene
   * with a synth pad all night after a bad deploy (review M5/security).
   * The one legitimate prod override is restartAfterContextLoss, where
   * sound at 3am beats silence.
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
  // The overnight-survival protections (silent keep-alive + element sink,
  // SW keep-alive pings, OS media session) must live and die with the
  // *audio*, not with whatever screen happens to be mounted — review bug
  // C1. They are engaged on scene start and torn down on stopScene, so a
  // "← Scenes" exit while audio plays strips nothing.
  private protectionsEngaged = false;
  private mediaSessionManaged = false;
  /**
   * Monotonic stamp for scene-start requests (review bug M1). Each
   * startScene/crossfadeTo/stop/context-rebuild bumps it; a request that
   * finds its stamp stale after the async load disposes its scene instead
   * of wiring it into the graph, where it would otherwise play at full
   * volume forever with nothing referencing it. Serializes overlapping
   * starts down to exactly one winner.
   */
  private startGeneration = 0;
  /**
   * The sleep timer, owned by the session rather than the Player (review
   * bugs H1 + H3). Its fade/stop hooks read engine.bus and stopScene fresh
   * at call time, so they survive a mid-night context rebuild.
   */
  readonly sleepTimer: SleepTimer;
  /**
   * Night Drift (roadmap 6.2): a session-level timer that crossfades the
   * scene into its `driftsTo` target after N minutes. Owned here, not by a
   * screen, so it survives a Player unmount and is cancelled by any scene
   * stop/switch. The resolver turns a target id into a definition.
   */
  private driftTimer: ReturnType<typeof setTimeout> | null = null;
  private sceneResolver:
    | ((id: string) => Promise<SceneDefinition | null>)
    | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
    this.sleepTimer = new SleepTimer({
      fade: (seconds) => this.engine.bus.fadeToSilence(seconds),
      stop: () => this.stopScene(),
      cancelFade: (volume) => this.engine.bus.cancelFade(volume, 1),
    });
    // If the engine had to rebuild a dead AudioContext (overnight
    // platform teardown — see AudioEngine.recreateContext), every node
    // in the current scene died with the old context. Rebuild the same
    // scene from its definition so the room fills back up without the
    // user having to re-pick anything.
    engine.addListener((e) => {
      if (e.kind === 'context-recreated') void this.restartAfterContextLoss();
      // Keep the OS media session's play/pause icon in sync with a
      // soft-pause, including the auto-resume that fires when the app
      // returns to the foreground (review M4). Only when we own the
      // session (not the content player's narration).
      else if (e.kind === 'user-paused' && this.mediaSessionManaged) {
        setMediaSessionPlaybackState('paused');
      } else if (e.kind === 'user-resumed' && this.mediaSessionManaged) {
        setMediaSessionPlaybackState('playing');
      }
    });
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
    const fallback = options.fallbackToSynthetic ?? import.meta.env.DEV;

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

    // 3) Element layers — one FileLayer per element. We decode ONLY the
    //    first variant of each element before the scene starts; the rest
    //    are decoded in the background a little later (loadDeferredVariants).
    //    Decoding every variant up front meant a cold-cache scene downloaded
    //    + decoded ~4 long files (each a huge PCM buffer) before a note
    //    played — the 15–45s "is it frozen?" load and the startup memory
    //    contention. Variants only rotate at the loopOffset boundary
    //    (>=251s, minutes out), so the others have all the time they need.
    const deferred: DeferredVariantLoad[] = [];
    // Decode each element's first variant in PARALLEL so a heavy scene (e.g.
    // forest-evening, 4 elements) loads in the time of its slowest single
    // file rather than the sum of all four. This happens before the scene
    // starts, so the simultaneous decode can't stutter audio — there's none
    // yet — it just shortens the "is it frozen?" load.
    const firsts = await Promise.all(
      definition.elements.map(async (element) => {
        if (element.variants.length === 0) {
          throw new Error(
            `Scene element "${element.id}" has no variants — every element ` +
              `needs at least one recording.`
          );
        }
        const first = await this.loadVariant(
          element,
          element.variants[0]!,
          fallback,
          options.onVariantLoaded
        );
        return { element, first };
      })
    );
    for (const { element, first } of firsts) {
      const fileLayer = new FileLayer(this.engine, {
        id: `${definition.id}:${element.id}`,
        label: element.label,
        variants: [first],
        crossfadeSeconds: element.crossfadeSeconds,
        defaultVolume: element.defaultVolume,
        variantRotation: element.variantRotation,
      });
      layers.push(fileLayer);
      const rest = element.variants.slice(1);
      if (rest.length > 0) deferred.push({ fileLayer, element, variants: rest });
    }

    const scene = new Scene(this.engine, {
      id: definition.id,
      definition,
      layers,
    });

    if (deferred.length > 0) {
      this.scheduleDeferredVariants(deferred, fallback, options.onVariantLoaded);
    }
    return scene;
  }

  /**
   * Decode the remaining (non-first) variants of each element in the
   * background, a little after the scene starts, and add them to the
   * rotation. Deferred so the decode doesn't contend with the scene's first
   * seconds; spaced out and sequential to keep memory/CPU spikes small. A
   * variant that fails to load just means less rotation, never a crash.
   */
  private scheduleDeferredVariants(
    loads: DeferredVariantLoad[],
    fallback: boolean,
    onLoaded?: (info: VariantLoadOutcome) => void
  ): void {
    setTimeout(() => {
      void this.loadDeferredVariants(loads, fallback, onLoaded);
    }, DEFERRED_VARIANT_DELAY_MS);
  }

  private async loadDeferredVariants(
    loads: DeferredVariantLoad[],
    fallback: boolean,
    onLoaded?: (info: VariantLoadOutcome) => void
  ): Promise<void> {
    // Flatten to one queue and decode one variant at a time with a gap
    // between each. A heavy scene (forest-evening: 4 deferred variants) used
    // to decode them back-to-back the moment the timer fired — four ~200 MB
    // PCM allocations in a row, a stutter burst ~20s in. Spacing them out
    // turns that into isolated blips the lookahead pipeline absorbs, and they
    // still land far ahead of the first rotation (loopOffset >= 251s).
    const queue = loads.flatMap(({ fileLayer, element, variants }) =>
      variants.map((variant) => ({ fileLayer, element, variant }))
    );
    recordEvent('variant-deferred-start', String(queue.length));
    for (let i = 0; i < queue.length; i++) {
      const { fileLayer, element, variant } = queue[i]!;
      if (fileLayer.isDisposed) continue; // scene torn down — skip the work
      try {
        const v = await this.loadVariant(element, variant, fallback, onLoaded);
        if (!fileLayer.isDisposed) fileLayer.addVariant(v);
      } catch (err) {
        recordEvent(
          'variant-deferred-fail',
          `${element.id}/${variant.id}: ${shortErr(err)}`
        );
      }
      // Breathe between heavy decodes (skip after the last).
      if (i < queue.length - 1) await sleepMs(DEFERRED_VARIANT_GAP_MS);
    }
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
      /**
       * Scene-gain target for the first-start fade-in (default 1.0). The
       * 3 a.m. Door passes a reduced value so the resume seeps in quietly
       * (roadmap 6.1); applied to the scene's own gain, not master, so the
       * Player's master-volume restore can't undo it.
       */
      firstFadeTarget?: number;
      /**
       * Whether this session should own the OS media session (default
       * true). The content player passes false: it manages its own media
       * session for the narration (title + Howler transport), so the
       * coordinator must not stamp the bed scene's label over it.
       */
      manageMediaSession?: boolean;
      /**
       * Arm the session's sleep timer to this many minutes. Tonight passes
       * the user's `defaultTimerMinutes` so the countdown belongs to the
       * playback session, not the Player (review bug H3). `null`/omitted
       * resets the timer to off — and either way a fresh start cancels any
       * pending fade-exit from the previous session (bug H1).
       */
      sleepTimerMinutes?: number | null;
    } = {}
  ): Promise<Scene> {
    if (this.currentScene && !this.currentScene.isDisposed()) {
      return this.crossfadeTo(definition, options);
    }
    const generation = ++this.startGeneration;
    const scene = await this.loadScene(definition, options);
    if (generation !== this.startGeneration) {
      // A newer start/crossfade/stop superseded us while we were loading.
      // Nothing references this scene; dispose it rather than wire it into
      // the bus, where it would play unmixed forever (bug M1).
      scene.dispose();
      return scene;
    }
    scene.output.connect(this.engine.bus.input);
    // Pre-warm the <audio> element sink on the silent keep-alive BEFORE the
    // scene's audio ramps in. Engaging the MediaStream sink has a brief
    // priming hiccup on Android; doing it here (scene gain still 0) lets that
    // settle on silence rather than stuttering the first audible seconds.
    // Idempotent — engageSessionProtections below calls it again as a no-op.
    this.engine.startKeepAlive();
    scene.start();
    // First start from silence uses the front-loaded 'ease-out' curve so
    // the scene becomes audible quickly. Cross-scene fades (crossfadeTo)
    // keep the linear ramp, which pairs with the outgoing fade-out.
    scene.fadeIn(
      options.firstFadeSeconds ?? DEFAULT_SCENE_FIRST_START_SECONDS,
      options.firstFadeTarget ?? 1.0,
      'ease-out'
    );
    this.currentScene = scene;
    recordEvent('scene-start', scene.definition.id);
    this.engageSessionProtections(scene, options.manageMediaSession ?? true);
    this.applySessionTimer(options.sleepTimerMinutes);
    this.scheduleDrift(scene.definition);
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
    options: LoadSceneOptions & {
      fadeSeconds?: number;
      manageMediaSession?: boolean;
      sleepTimerMinutes?: number | null;
    } = {}
  ): Promise<Scene> {
    const fade = options.fadeSeconds ?? DEFAULT_SCENE_CROSSFADE_SECONDS;
    const generation = ++this.startGeneration;
    const outgoing = this.currentScene;
    const incoming = await this.loadScene(definition, options);
    if (generation !== this.startGeneration) {
      // Superseded mid-load by a newer request (bug M1). Dispose rather
      // than start — and leave `outgoing` for the winner to crossfade from.
      incoming.dispose();
      return incoming;
    }

    incoming.output.connect(this.engine.bus.input);
    incoming.start();
    incoming.fadeIn(fade);

    if (outgoing && !outgoing.isDisposed()) {
      outgoing.fadeAndDispose(fade);
    }

    this.currentScene = incoming;
    recordEvent('scene-switch', incoming.definition.id);
    // The session protections are already engaged (a scene was playing);
    // this just refreshes the media-session label to the new scene.
    this.engageSessionProtections(incoming, options.manageMediaSession ?? true);
    // Re-key the sleep timer to the incoming session: this cancels the
    // outgoing scene's countdown AND any pending fade-exit, so a stale
    // timeout can never stop the new scene (review bug H1).
    this.applySessionTimer(options.sleepTimerMinutes);
    // Re-key Night Drift to the incoming scene (its own driftsTo, or none).
    this.scheduleDrift(incoming.definition);
    return incoming;
  }

  /**
   * Stop the current scene with a fade-out. Returns immediately —
   * teardown is asynchronous via fadeAndDispose. To wait for the fade
   * to fully complete, await `waitForDisposal(fadeSeconds)`.
   */
  stopScene(fadeSeconds = DEFAULT_SCENE_FIRST_START_SECONDS): void {
    // Supersede any in-flight start so a scene still loading when the user
    // stops disposes itself on resolve instead of starting over the silence
    // (bug M1). Bump before the early return so a stop during a first-start
    // load — when currentScene is still null — also cancels it.
    this.startGeneration++;
    if (!this.currentScene) return;
    const stoppedId = this.currentScene.definition.id;
    this.currentScene.fadeAndDispose(fadeSeconds);
    this.currentScene = null;
    // Drop the sleep timer with no audio side effect — this scene's own
    // fade above owns the gain ramp. reset() is a no-op if the stop was
    // itself the timer's fade-exit firing.
    this.sleepTimer.reset();
    this.cancelDrift();
    recordEvent('scene-stop', stoppedId);
    this.disengageSessionProtections();
  }

  /** Arm or clear the session sleep timer per a start/crossfade option. */
  private applySessionTimer(minutes: number | null | undefined): void {
    if (minutes != null && minutes > 0) this.sleepTimer.start(minutes);
    else this.sleepTimer.reset();
  }

  // ---------------------------------------------------------------------
  // Night Drift (roadmap 6.2)

  /** Wire the catalogue lookup the drift uses to resolve a target id into a
   *  definition. Set once by the app shell. */
  setSceneResolver(fn: (id: string) => Promise<SceneDefinition | null>): void {
    this.sceneResolver = fn;
  }

  /** True while a drift is pending — for diagnostics/tests. */
  get isDriftScheduled(): boolean {
    return this.driftTimer !== null;
  }

  /** Arm (or clear) the drift for the given scene. Idempotent re-key. */
  private scheduleDrift(definition: SceneDefinition): void {
    this.cancelDrift();
    const drift = definition.driftsTo;
    if (!drift) return;
    this.driftTimer = setTimeout(() => {
      this.driftTimer = null;
      void this.performDrift(drift);
    }, drift.afterMinutes * 60_000);
  }

  private cancelDrift(): void {
    if (this.driftTimer) {
      clearTimeout(this.driftTimer);
      this.driftTimer = null;
    }
  }

  private async performDrift(
    drift: NonNullable<SceneDefinition['driftsTo']>
  ): Promise<void> {
    if (!this.sceneResolver || !this.currentScene) return;
    // Stamp the session so a user start/stop during the async resolve wins.
    const gen = this.startGeneration;
    let targetDef: SceneDefinition | null;
    try {
      targetDef = await this.sceneResolver(drift.sceneId);
    } catch (err) {
      console.error('[SceneCoordinator] Night Drift resolve failed:', err);
      return;
    }
    if (!targetDef || gen !== this.startGeneration || !this.currentScene) return;
    recordEvent(
      'scene-drift',
      `${this.currentScene.definition.id}->${drift.sceneId}`
    );
    await this.crossfadeTo(targetDef, {
      fadeSeconds: drift.crossfadeSeconds ?? DEFAULT_DRIFT_CROSSFADE_SECONDS,
    });
  }

  // ---------------------------------------------------------------------
  // Session protections (review bug C1)

  /**
   * Engage the protections that keep an overnight session alive: the
   * engine's silent keep-alive + <audio> element sink, the service-worker
   * keep-alive pings, and (when this session owns it) the OS media
   * session. Idempotent — keep-alive and SW pings are no-ops if already
   * running, and a crossfade just refreshes the media-session label.
   */
  private engageSessionProtections(
    scene: Scene,
    manageMediaSession: boolean
  ): void {
    this.engine.startKeepAlive();
    startSwKeepAlive();
    if (manageMediaSession) {
      this.mediaSessionManaged = true;
      setMediaSessionForScene(scene.definition.label, {
        onStop: () => this.stopScene(),
        // Soft-pause, resumable (review M4 / roadmap 3.6): a stray headset
        // bump or Bluetooth disconnect suspends the context but leaves the
        // session intact, so lock-screen Play (or foregrounding the app)
        // resumes it — rather than ending the night unrecoverably.
        onPause: () => void this.engine.pauseForUser(),
        onPlay: () => {
          if (this.engine.isUserPaused) {
            void this.engine.resumeForUser();
          } else {
            // OS suspended the context without a soft-pause — just resume.
            const ctx = this.engine.context;
            if (ctx.state !== 'running') void ctx.resume();
          }
        },
      });
    }
    if (!this.protectionsEngaged) {
      this.protectionsEngaged = true;
      recordEvent('keepalive-start', 'session');
    }
  }

  /** Tear down everything engageSessionProtections started. */
  private disengageSessionProtections(): void {
    if (!this.protectionsEngaged) return;
    this.engine.stopKeepAlive();
    stopSwKeepAlive();
    if (this.mediaSessionManaged) clearMediaSession();
    this.mediaSessionManaged = false;
    this.protectionsEngaged = false;
    recordEvent('keepalive-stop', 'session');
  }

  /** True while the current session's overnight protections are engaged. */
  get isProtectionEngaged(): boolean {
    return this.protectionsEngaged;
  }

  // ---------------------------------------------------------------------
  // Internal helpers

  /**
   * Rebuild the current scene after the engine replaced its AudioContext.
   * The old Scene's nodes all belong to the closed context, so it is
   * disposed immediately — but `currentScene` keeps pointing at the
   * corpse until the replacement is ready, so UI that polls
   * getCurrentScene() doesn't see a "nothing playing" flash and bounce
   * the user out of the player mid-rebuild.
   */
  private async restartAfterContextLoss(): Promise<void> {
    const dead = this.currentScene;
    if (!dead) return;
    // Supersede any user start that was in flight on the now-dead context:
    // its nodes belong to the closed context, so wiring them into the new
    // bus would be broken (bug M1). The rebuild becomes the latest request.
    const generation = ++this.startGeneration;
    const definition = dead.definition;
    try {
      dead.dispose();
    } catch {
      /* nodes belong to the closed context */
    }
    recordEvent('scene-restart', definition.id);

    // True while this rebuild is still the latest request and the user
    // hasn't started/stopped something in the meantime.
    const stillOurs = () =>
      this.currentScene === dead && generation === this.startGeneration;

    // Retry the full rebuild with backoff. A 3am context loss is often
    // paired with a transient network drop (offline with a cold cache), and
    // a couple of retries recovers the REAL scene rather than bouncing the
    // user to Tonight or dropping to a bare synth bed (review bug M6).
    for (let attempt = 0; attempt < RESTART_RETRY_DELAYS_MS.length; attempt++) {
      if (!stillOurs()) return;
      if (attempt > 0) await sleepMs(RESTART_RETRY_DELAYS_MS[attempt]!);
      if (!stillOurs()) return;
      try {
        const scene = await this.loadScene(definition, {
          fallbackToSynthetic: true,
        });
        if (!stillOurs()) {
          scene.dispose();
          return;
        }
        this.wireRebuiltScene(scene);
        return;
      } catch (err) {
        recordEvent('scene-restart-retry', `${attempt}: ${shortErr(err)}`);
      }
    }

    // Every retry failed — we're offline with a cold cache at 3am. Fall back
    // to the scene's synth bed ALONE: it needs only the noise worklet (no
    // variant fetches), and sound beats silence. This is the one legitimate
    // production use of synthetic audio (CLAUDE.md).
    if (!stillOurs()) return;
    try {
      const bed = await this.loadSynthBedOnly(definition);
      if (!stillOurs()) {
        bed.dispose();
        return;
      }
      this.wireRebuiltScene(bed);
      recordEvent('scene-restart-synthbed', definition.id);
    } catch (err) {
      if (this.currentScene === dead) {
        this.currentScene = null;
        // Truly nothing left to play (even the worklet is gone). Release the
        // protections so we don't keep keep-alive and a stale media session
        // running over silence.
        this.disengageSessionProtections();
      }
      console.error(
        '[SceneCoordinator] scene restart after context loss failed:',
        err
      );
    }
  }

  /** Connect, start, and fade in a rebuilt scene, making it current. */
  private wireRebuiltScene(scene: Scene): void {
    scene.output.connect(this.engine.bus.input);
    scene.start();
    scene.fadeIn(DEFAULT_SCENE_FIRST_START_SECONDS, 1.0, 'ease-out');
    this.currentScene = scene;
  }

  /**
   * Build a degraded scene containing only the synth bed — no FileLayers, so
   * no audio-file fetches. Used as the last-resort night rescue when the
   * real variants can't be re-fetched (offline, cold cache). Every scene
   * defines a synth bed, so this is always constructable.
   */
  private async loadSynthBedOnly(definition: SceneDefinition): Promise<Scene> {
    await this.engine.loadNoiseWorklet();
    const synth = new NoiseGenerator(this.engine, {
      id: `${definition.id}:synth-bed`,
      label: 'Synth bed',
      color: definition.synth.color,
      defaultVolume: definition.synth.defaultVolume,
    });
    return new Scene(this.engine, {
      id: definition.id,
      definition,
      layers: [synth],
    });
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
