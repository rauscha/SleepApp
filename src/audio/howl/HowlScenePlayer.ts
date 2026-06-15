// HowlScenePlayer — the playback session for Path A scene beds.
//
// A drop-in replacement for SceneCoordinator's production surface
// (startScene / crossfadeTo / stopScene / getCurrentScene / sleepTimer /
// setSceneResolver), but backed by HowlScene (real html5 <audio> elements)
// instead of the Web Audio graph. Because the OS owns each looping element,
// none of the old overnight-survival machinery is needed here: no silent
// keep-alive, no element sink, no zombie watchdog, no context-recreate. The
// session still owns the sleep timer, Night Drift, and the OS media session
// so they survive leaving the Player screen (review bugs C1 / H1 / H3).

import {
  DEFAULT_SCENE_CROSSFADE_SECONDS,
  DEFAULT_SCENE_FIRST_START_SECONDS,
  DEFAULT_DRIFT_CROSSFADE_SECONDS,
} from '../SceneCoordinator';
import { SleepTimer } from '../SleepTimer';
import { recordEvent } from '../../diagnostics/lifecycleLog';
import { startSwKeepAlive, stopSwKeepAlive } from '../../serviceWorker/keepAlive';
import {
  clearMediaSession,
  setMediaSessionForScene,
  setMediaSessionPlaybackState,
} from '../mediaSession';
import type { SceneDefinition } from '../sceneFormat';
import { HowlScene, defaultHowlFactory } from './HowlScene';
import type { HowlFactory } from './HowlScene';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface StartSceneOptions {
  /** Cross-scene fade duration (default 8s). */
  fadeSeconds?: number;
  /** First-start fade-in from silence (default 5s). */
  firstFadeSeconds?: number;
  /** Persistent scene-gain target for the first fade (default 1.0; the 3am
   *  Door passes a reduced value so the resume stays quiet). */
  firstFadeTarget?: number;
  /** Arm the session sleep timer to this many minutes (null/omitted = off). */
  sleepTimerMinutes?: number | null;
  /** Whether this session owns the OS media session (default true; the
   *  content player passes false — it owns the session for its narration). */
  manageMediaSession?: boolean;
  /** Accepted for call-site compatibility with SceneCoordinator; the html5
   *  path streams real files, so there is no synthetic fallback to apply. */
  fallbackToSynthetic?: boolean;
}

export class HowlScenePlayer {
  private current: HowlScene | null = null;
  private master = 1;
  /** Monotonic stamp serializing overlapping start/crossfade/stop requests
   *  down to one winner (review bug M1), same contract as SceneCoordinator. */
  private startGeneration = 0;
  private mediaManaged = false;
  private protectionsEngaged = false;
  private driftTimer: ReturnType<typeof setTimeout> | null = null;
  private sceneResolver:
    | ((id: string) => Promise<SceneDefinition | null>)
    | null = null;
  private readonly factory: HowlFactory;

  readonly sleepTimer: SleepTimer;

  constructor(factory: HowlFactory = defaultHowlFactory) {
    this.factory = factory;
    this.sleepTimer = new SleepTimer({
      fade: (seconds) => this.current?.fadeToSilence(seconds),
      stop: () => this.stopScene(),
      cancelFade: (volume) => {
        this.master = clamp01(volume);
        this.current?.restore(this.master);
      },
    });
  }

  getCurrentScene(): HowlScene | null {
    return this.current;
  }

  /** Set the user master volume; applies live to the current scene. */
  setMasterVolume(v: number): void {
    this.master = clamp01(v);
    this.current?.setMaster(this.master);
  }

  getMasterVolume(): number {
    return this.master;
  }

  async startScene(
    definition: SceneDefinition,
    options: StartSceneOptions = {}
  ): Promise<HowlScene> {
    if (this.current && !this.current.isDisposed()) {
      return this.crossfadeTo(definition, options);
    }
    const generation = ++this.startGeneration;
    const scene = new HowlScene(definition, this.master, this.factory);
    // The build is synchronous, but a stop() could still have bumped the
    // generation between the ++ above and here in a re-entrant call; guard
    // anyway to keep the one-winner contract identical to SceneCoordinator.
    if (generation !== this.startGeneration) {
      scene.dispose();
      return scene;
    }
    scene.start(
      options.firstFadeSeconds ?? DEFAULT_SCENE_FIRST_START_SECONDS,
      options.firstFadeTarget ?? 1
    );
    this.current = scene;
    recordEvent('scene-start', definition.id);
    this.engageSessionProtections(scene, options.manageMediaSession ?? true);
    this.applySessionTimer(options.sleepTimerMinutes);
    this.scheduleDrift(definition);
    return scene;
  }

  async crossfadeTo(
    definition: SceneDefinition,
    options: StartSceneOptions = {}
  ): Promise<HowlScene> {
    const fade = options.fadeSeconds ?? DEFAULT_SCENE_CROSSFADE_SECONDS;
    const generation = ++this.startGeneration;
    const outgoing = this.current;
    const incoming = new HowlScene(definition, this.master, this.factory);
    if (generation !== this.startGeneration) {
      incoming.dispose();
      return incoming;
    }
    incoming.start(fade, options.firstFadeTarget ?? 1);
    if (outgoing && !outgoing.isDisposed()) outgoing.fadeAndDispose(fade);
    this.current = incoming;
    recordEvent('scene-switch', definition.id);
    this.engageSessionProtections(incoming, options.manageMediaSession ?? true);
    this.applySessionTimer(options.sleepTimerMinutes);
    this.scheduleDrift(definition);
    return incoming;
  }

  stopScene(fadeSeconds = DEFAULT_SCENE_FIRST_START_SECONDS): void {
    // Supersede any in-flight start (bump before the early return so a stop
    // during a first-start load also cancels it).
    this.startGeneration++;
    if (!this.current) return;
    const stoppedId = this.current.definition.id;
    this.current.fadeAndDispose(fadeSeconds);
    this.current = null;
    this.sleepTimer.reset();
    this.cancelDrift();
    recordEvent('scene-stop', stoppedId);
    this.disengageSessionProtections();
  }

  private applySessionTimer(minutes: number | null | undefined): void {
    if (minutes != null && minutes > 0) this.sleepTimer.start(minutes);
    else this.sleepTimer.reset();
  }

  // -------------------------------------------------------------------------
  // Night Drift (roadmap 6.2)

  setSceneResolver(fn: (id: string) => Promise<SceneDefinition | null>): void {
    this.sceneResolver = fn;
  }

  get isDriftScheduled(): boolean {
    return this.driftTimer !== null;
  }

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
    if (!this.sceneResolver || !this.current) return;
    const gen = this.startGeneration;
    let targetDef: SceneDefinition | null;
    try {
      targetDef = await this.sceneResolver(drift.sceneId);
    } catch (err) {
      console.error('[HowlScenePlayer] Night Drift resolve failed:', err);
      return;
    }
    if (!targetDef || gen !== this.startGeneration || !this.current) return;
    recordEvent('scene-drift', `${this.current.definition.id}->${drift.sceneId}`);
    await this.crossfadeTo(targetDef, {
      fadeSeconds: drift.crossfadeSeconds ?? DEFAULT_DRIFT_CROSSFADE_SECONDS,
    });
  }

  // -------------------------------------------------------------------------
  // Session protections — raise the tab's priority so the OS keeps the
  // looping media elements alive in the background. With the html5 path the
  // elements themselves are the keep-alive; we still want the media session
  // (lock-screen controls + Android tab-priority) and SW keep-alive ping.

  private engageSessionProtections(
    scene: HowlScene,
    manageMediaSession: boolean
  ): void {
    startSwKeepAlive();
    if (manageMediaSession) {
      this.mediaManaged = true;
      setMediaSessionForScene(scene.definition.label, {
        onStop: () => this.stopScene(),
        onPause: () => {
          this.current?.pause();
          setMediaSessionPlaybackState('paused');
        },
        onPlay: () => {
          this.current?.resume();
          setMediaSessionPlaybackState('playing');
        },
      });
    }
    if (!this.protectionsEngaged) {
      this.protectionsEngaged = true;
      recordEvent('keepalive-start', 'session');
    }
  }

  private disengageSessionProtections(): void {
    if (!this.protectionsEngaged) return;
    stopSwKeepAlive();
    if (this.mediaManaged) clearMediaSession();
    this.mediaManaged = false;
    this.protectionsEngaged = false;
    recordEvent('keepalive-stop', 'session');
  }

  get isProtectionEngaged(): boolean {
    return this.protectionsEngaged;
  }
}

let player: HowlScenePlayer | null = null;

/**
 * Singleton accessor. The Howler path is self-contained (no AudioEngine
 * argument), so this takes none — callers just ask for the session.
 */
export function getHowlScenePlayer(): HowlScenePlayer {
  if (!player) player = new HowlScenePlayer();
  return player;
}

/** Test seam: drop the singleton so each test starts clean. */
export function __resetHowlScenePlayerForTests(): void {
  player = null;
}
