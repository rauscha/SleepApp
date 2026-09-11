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

/** Holder name for this session's SW keep-alive hold. The ping is
 *  reference-counted: ContentPlayerScreen holds it under its own name for
 *  bare narration, and whichever stands down first must not stop the other's
 *  ping (see serviceWorker/keepAlive). */
const SW_KEEPALIVE_HOLDER = 'session';

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
  /** Scene-gain target the live scene was started at — 1 normally, reduced
   *  for a 3 a.m. Door resume. Held on the session so an automatic Night
   *  Drift can carry it onto the incoming scene instead of quietly
   *  restoring full level at 4am. */
  private sceneGain = 1;
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
    const live =
      this.current && !this.current.isDisposed() ? this.current : null;
    if (live && live.id === definition.id) return this.adoptLiveScene(live, options);
    if (live) return this.crossfadeTo(definition, options);
    const generation = ++this.startGeneration;
    const scene = new HowlScene(definition, this.master, this.factory);
    // The build is synchronous, but a stop() could still have bumped the
    // generation between the ++ above and here in a re-entrant call; guard
    // anyway to keep the one-winner contract identical to SceneCoordinator.
    if (generation !== this.startGeneration) {
      scene.dispose();
      return scene;
    }
    this.sceneGain = clamp01(options.firstFadeTarget ?? 1);
    scene.start(
      options.firstFadeSeconds ?? DEFAULT_SCENE_FIRST_START_SECONDS,
      this.sceneGain
    );
    this.current = scene;
    recordEvent('scene-start', definition.id);
    this.engageSessionProtections(scene, options.manageMediaSession ?? true);
    this.applySessionTimer(options.sleepTimerMinutes);
    this.scheduleDrift(definition);
    return scene;
  }

  /**
   * Re-picking the scene that is already playing must NOT rebuild it.
   * Tonight's handlePick is the only route back into the Player, so tapping
   * the live scene is a routine gesture — and it used to fall through to
   * crossfadeTo(), which built a second <audio> element per layer and faded
   * the two copies of the same loop against each other: roughly +6 dB with
   * comb filtering for the length of the fade, two more elements out of
   * Howler's pool of ten, and the armed countdown thrown away. Adopt the
   * live scene instead and touch only what the caller actually asked for.
   */
  private adoptLiveScene(
    live: HowlScene,
    options: StartSceneOptions
  ): HowlScene {
    recordEvent('scene-adopt', live.id);
    this.engageSessionProtections(live, options.manageMediaSession ?? true);
    switch (this.sleepTimer.getState().status) {
      case 'running':
        // The countdown belongs to the session, not the screen: re-entering
        // the Player must show the live remaining time, not re-arm the
        // default a fresh start would apply (review bug H3).
        break;
      case 'fading':
        // A re-tap mid fade-to-silence is the user saying "I'm still awake".
        // Cancel through the timer so the scene is restored, rather than
        // adopting one already on its way to silence, then honour the
        // caller's timer request.
        this.sleepTimer.cancel(this.master);
        this.applySessionTimer(options.sleepTimerMinutes);
        break;
      default:
        this.applySessionTimer(options.sleepTimerMinutes);
    }
    // Deliberately no scheduleDrift(): the drift is already armed from the
    // original start, and re-keying it here would let a user bouncing
    // between Tonight and the Player postpone the drift indefinitely.
    return live;
  }

  async crossfadeTo(
    definition: SceneDefinition,
    options: StartSceneOptions = {},
    /** Internal — Night Drift carries the armed sleep timer across the
     *  switch. A *user-initiated* switch must still reset it, so a pending
     *  fade-exit can never stop the new scene (review bug H1). */
    preserveSessionTimer = false
  ): Promise<HowlScene> {
    const fade = options.fadeSeconds ?? DEFAULT_SCENE_CROSSFADE_SECONDS;
    const generation = ++this.startGeneration;
    const outgoing = this.current;
    const incoming = new HowlScene(definition, this.master, this.factory);
    if (generation !== this.startGeneration) {
      incoming.dispose();
      return incoming;
    }
    this.sceneGain = clamp01(options.firstFadeTarget ?? 1);
    incoming.start(fade, this.sceneGain);
    if (outgoing && !outgoing.isDisposed()) outgoing.fadeAndDispose(fade);
    this.current = incoming;
    recordEvent('scene-switch', definition.id);
    this.engageSessionProtections(incoming, options.manageMediaSession ?? true);
    if (!preserveSessionTimer) this.applySessionTimer(options.sleepTimerMinutes);
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
    // The sleep timer is already fading the night out and a stop is pending
    // behind it. A fresh scene would come up at full level and then be
    // hard-cut by that fade-exit — let the night end instead.
    if (this.sleepTimer.getState().status === 'fading') return;
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
    await this.crossfadeTo(
      targetDef,
      {
        fadeSeconds: drift.crossfadeSeconds ?? DEFAULT_DRIFT_CROSSFADE_SECONDS,
        // Carry the live scene gain over: a 3 a.m. Door resume runs at a
        // reduced gain and a drift an hour later must not restore full level.
        firstFadeTarget: this.sceneGain,
      },
      // Keep the armed countdown. A drift is an automatic continuation of the
      // same night, not a user scene switch: passing no sleepTimerMinutes
      // through the normal path reset() it, so a confirmed "Stops in 47:12"
      // silently evaporated the moment the scene drifted and the bed then
      // played at full volume until morning (review bug H3, re-entered here).
      true
    );
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
    startSwKeepAlive(SW_KEEPALIVE_HOLDER);
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

  /**
   * Take (back) ownership of the OS media session for the live scene.
   *
   * The content player stamps the session with the narration's title while a
   * story plays (it passes `manageMediaSession: false` so the bed's label
   * doesn't overwrite it). When that screen goes away with the bed still
   * running it hands the session back here instead of clearing it — a tab
   * with no recognised media session is exactly what Chrome on Android
   * deprioritises and discards after ~10 minutes, which is the "fell asleep
   * to a story, woke up to silence" failure. No-op with nothing playing.
   */
  claimMediaSession(): void {
    if (!this.current || this.current.isDisposed()) return;
    this.engageSessionProtections(this.current, true);
  }

  private disengageSessionProtections(): void {
    if (!this.protectionsEngaged) return;
    stopSwKeepAlive(SW_KEEPALIVE_HOLDER);
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
