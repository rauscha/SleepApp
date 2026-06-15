// AudioEngine -- the AudioContext lifecycle manager and layer registry.
//
// Owns the AudioContext, the master bus, the AudioWorklet module
// registration, and the registry of active layers. Handles the gnarly
// mobile-browser lifecycle: user-gesture unlock, suspend/resume on
// visibilitychange/focus, and an iOS priming buffer.

import { MasterBus } from './MasterBus';
import { SilentKeepAlive } from './silentKeepAlive';
import type { Layer } from './types';
import { recordEvent } from '../diagnostics/lifecycleLog';

export type EngineEvent =
  | { kind: 'state'; state: AudioContextState }
  | { kind: 'context-recreated' }
  | { kind: 'layer-added'; id: string }
  | { kind: 'layer-removed'; id: string }
  | { kind: 'user-paused' }
  | { kind: 'user-resumed' };

export type EngineListener = (e: EngineEvent) => void;

/** How long to wait for ctx.resume() before declaring it wedged. iOS
 *  Safari is known to leave the resume() promise pending forever after
 *  an audio-session interruption. */
const RESUME_TIMEOUT_MS = 1500;
/** How long the foreground liveness probe waits to see currentTime
 *  advance. A healthy running context advances every render quantum
 *  (~2.7ms at 48kHz), so 400ms of stillness means the rendering thread
 *  is gone even though state says 'running'. */
const LIVENESS_PROBE_MS = 400;
/** Floor between automatic context rebuilds so a hard platform failure
 *  can't put us in a rebuild loop. User-gesture rebuilds bypass this. */
const RECREATE_MIN_INTERVAL_MS = 30_000;
/** Floor between element-sink re-engages after a detected silent stall, so a
 *  persistently stalling sink can't thrash the audio graph. */
const SINK_REENGAGE_MIN_INTERVAL_MS = 30_000;
/** Consecutive watchdog ticks of a frozen element clock (after it had been
 *  advancing) before we treat the sink as stalled. */
const SINK_STALL_TICKS = 3;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterBus: MasterBus | null = null;
  private workletReady = false;
  private workletPromise: Promise<void> | null = null;
  private layers = new Map<string, Layer>();
  private listeners = new Set<EngineListener>();
  private visibilityHandlerInstalled = false;
  private keepAlive: SilentKeepAlive | null = null;
  private verifyInFlight = false;
  private lastRecreateMs = 0;
  private lastWatchdogCurrentTime = -1;
  private stagnantTicks = 0;
  private sinkElement: HTMLAudioElement | null = null;
  private elementSinkEngaged = false;
  // Guards against a concurrent engageElementSink() while a previous engage's
  // el.play() is still pending. `elementSinkEngaged` only flips true AFTER
  // that await, so without this flag two near-simultaneous engages (e.g. the
  // scene-start pre-warm + engageSessionProtections) both run: the second
  // reassigns srcObject, interrupting the first play() with an AbortError,
  // and the sink ends up DETACHED but flagged engaged — silently killing the
  // overnight "playing media" protection. Set synchronously before the await.
  private elementSinkEngaging = false;
  // Element-sink silent-stall detection. The sink routes audio through an
  // <audio> element fed by a MediaStream; on some Androids that pipe stops
  // feeding the speaker WITHOUT firing 'pause' — audio dies while the
  // AudioContext keeps ticking, invisible to every other check (the
  // documented watchdog blind spot). We sample the ELEMENT's own clock: if
  // it freezes after having advanced, the sink stalled and we re-engage it.
  private sinkLastCurrentTime = -1;
  private sinkStallTicks = 0;
  private sinkClockAdvancedEver = false;
  private sinkSampleCount = 0;
  private sinkClockLogged = false;
  private lastSinkReengageMs = 0;
  // True while the user (lock-screen / headset pause) has deliberately
  // suspended playback. The whole survival stack exists to KEEP the context
  // running, so a soft-pause has to suppress the auto-resume machinery
  // (watchdog, visibilitychange/focus resume, liveness probe) until the user
  // resumes — otherwise we'd wake the context right back up. (Review M4.)
  private userPaused = false;

  static readonly LAYER_SOFT_CAP = 6;

  get isInitialized(): boolean {
    return this.ctx !== null;
  }

  get state(): AudioContextState | 'closed' {
    return this.ctx?.state ?? 'closed';
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor =
      (window.AudioContext as typeof AudioContext | undefined) ??
      ((window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext as typeof AudioContext | undefined);
    if (!Ctor) {
      throw new Error('Web Audio API is not supported in this browser.');
    }
    const ctx = new Ctor({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.masterBus = new MasterBus(ctx);
    this.installVisibilityHandler();
    // Log AudioContext state transitions directly from the engine, so they
    // land in the lifecycle log regardless of which screen is mounted. This
    // is the load-bearing signal for diagnosing "audio dies in background"
    // — a Signal text grabbing audio focus, the OS interrupting the
    // context, etc., all surface here as suspended/running transitions.
    // Also record the initial state at context creation so the log
    // includes the starting point for every session.
    recordEvent('audio-state', ctx.state);
    ctx.addEventListener('statechange', () => {
      recordEvent('audio-state', ctx.state);
      this.emit({ kind: 'state', state: ctx.state });
    });
    return ctx;
  }

  async unlock(): Promise<void> {
    const hadContext = this.ctx !== null;
    let ctx = this.ensureContext();
    // 'suspended' is the standard not-running state; iOS Safari also has
    // a non-standard 'interrupted' state after the OS takes the audio
    // session. Compare against 'running' so both get a resume attempt.
    if ((ctx.state as string) !== 'running') {
      try {
        await resumeWithTimeout(ctx, RESUME_TIMEOUT_MS);
      } catch (err) {
        console.warn('[AudioEngine] resume failed:', err);
      }
    }
    // A pre-existing context that still refuses to run after an
    // in-gesture resume is dead at the platform level (overnight
    // audio-session teardown, interrupted state that never clears).
    // unlock() runs inside a user gesture — the one moment a brand-new
    // context is guaranteed permission to start — so rebuild here rather
    // than handing callers a context that will schedule into silence.
    if (hadContext && this.ctx === ctx && (ctx.state as string) !== 'running') {
      this.recreateContext();
      ctx = this.ensureContext();
    }
    const primer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = primer;
    src.connect(ctx.destination);
    src.start(0);
    src.stop(ctx.currentTime + 0.01);
  }

  get bus(): MasterBus {
    if (!this.masterBus) {
      throw new Error('AudioEngine not unlocked yet -- call unlock() first.');
    }
    return this.masterBus;
  }

  get context(): AudioContext {
    if (!this.ctx) {
      throw new Error('AudioEngine not unlocked yet -- call unlock() first.');
    }
    return this.ctx;
  }

  async loadNoiseWorklet(): Promise<void> {
    if (this.workletReady) return;
    if (this.workletPromise) return this.workletPromise;
    const ctx = this.ensureContext();
    if (!ctx.audioWorklet) {
      // Include diagnostic info — the most common cause is an older browser
      // that supports AudioContext but not the AudioWorklet add-on (iOS
      // Safari < 14.1, Android Chrome < 66). The userAgent is included so
      // we can verify on the affected device.
      const ctor = (ctx as unknown as { constructor: { name: string } }).constructor.name;
      const isSecure = typeof window !== 'undefined' ? window.isSecureContext : 'unknown';
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
      throw new Error(
        `AudioWorklet not supported here. ` +
          `AudioContext=${ctor}, secureContext=${isSecure}. UA: ${ua}`
      );
    }
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    // The .catch() that clears the cached promise is load-bearing: if the
    // first addModule() rejects (transient network blip, stale SW serving
    // a deleted asset after a deploy), without this branch every later
    // call returns the same rejected promise forever and only a tab
    // reload recovers. Clearing the cache on failure means the next
    // user gesture re-tries cleanly. The throw is rethrown so the
    // current caller still sees the original error.
    const attempt = ctx.audioWorklet
      .addModule(`${base}/worklets/noise-processor.js`)
      .then(() => {
        this.workletReady = true;
      })
      .catch((err) => {
        if (this.workletPromise === attempt) this.workletPromise = null;
        throw err;
      });
    this.workletPromise = attempt;
    return attempt;
  }

  get isWorkletReady(): boolean {
    return this.workletReady;
  }

  /**
   * Register a layer and connect its output to the master bus.
   * Enforces the section 3.3 soft cap of 6 concurrent layers. Pass
   * { allowOverCap: true } to bypass.
   */
  addLayer(layer: Layer, options: { allowOverCap?: boolean } = {}): void {
    if (this.layers.has(layer.id)) {
      throw new Error(`Layer with id "${layer.id}" already exists.`);
    }
    if (
      !options.allowOverCap &&
      this.layers.size >= AudioEngine.LAYER_SOFT_CAP
    ) {
      throw new LayerCapExceededError(this.layers.size);
    }
    layer.output.connect(this.bus.input);
    this.layers.set(layer.id, layer);
    this.emit({ kind: 'layer-added', id: layer.id });
  }

  /**
   * Remove a layer. The layer is unregistered immediately so callers can
   * proceed without waiting for the fade-out. The returned Promise resolves
   * once the fade has finished and the layer's nodes have been torn down;
   * callers that don't care can ignore it.
   *
   * This non-blocking shape is what Phase-2 scene transitions need: the
   * brief specifies overlapping fades, so the outgoing scene's layers must
   * be "logically gone" the instant the new scene is asked for, even though
   * their tails are still playing.
   */
  removeLayer(id: string): Promise<void> {
    const layer = this.layers.get(id);
    if (!layer) return Promise.resolve();
    // Unregister synchronously so the engine no longer counts this layer
    // toward the soft cap, and so listeners see the change immediately.
    this.layers.delete(id);
    this.emit({ kind: 'layer-removed', id });
    return layer
      .stop()
      .catch((err) => {
        console.warn(`[AudioEngine] layer "${id}" stop() rejected:`, err);
      })
      .then(() => {
        try {
          layer.output.disconnect();
        } catch {
          /* noop */
        }
        try {
          layer.dispose();
        } catch (err) {
          console.warn(`[AudioEngine] layer "${id}" dispose() threw:`, err);
        }
      });
  }

  /**
   * Non-blocking variant of removeLayer for cross-scene transitions.
   * Initiates the fade synchronously, removes the layer from the
   * registry immediately, and tears down nodes in a fire-and-forget
   * tail after the fade completes. This is what makes the brief's
   * 8-second overlapping cross-scene fade actually overlap — both
   * scenes' layers fade simultaneously instead of sequentially.
   */
  fadeOutLayer(id: string, durationSeconds: number): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    this.layers.delete(id);
    layer.fadeAndDispose(durationSeconds);
    // The layer's output disconnect happens inside its own dispose()
    // after the fade tail. We do not disconnect here — the audio still
    // needs to flow to the bus until the fade-out finishes.
    this.emit({ kind: 'layer-removed', id });
  }

  getLayers(): readonly Layer[] {
    return Array.from(this.layers.values());
  }

  getLayer(id: string): Layer | undefined {
    return this.layers.get(id);
  }

  get activeLayerCount(): number {
    return this.layers.size;
  }

  /**
   * Start a silent looping buffer through the master bus. Call this when a
   * playback session begins (scene started) — it keeps Android Chrome from
   * declaring the AudioContext idle and suspending it. Idempotent.
   *
   * See `silentKeepAlive.ts` for the rationale. Pair with stopKeepAlive()
   * when playback fully ends.
   */
  startKeepAlive(): void {
    if (!this.ctx || !this.masterBus) return;
    if (!this.keepAlive) {
      this.keepAlive = new SilentKeepAlive(this.ctx, this.masterBus.input);
    }
    this.keepAlive.start();
    // Session start is also when the bus output moves into a real <audio>
    // element — Chrome's discard/freeze protection only covers tabs that
    // are audibly playing a media element, not bare Web Audio.
    void this.engageElementSink();
  }

  /** Stop the silent keep-alive loop. Safe to call when not started. */
  stopKeepAlive(): void {
    this.keepAlive?.stop();
    this.disengageElementSink();
  }

  /**
   * Move the audible output from ctx.destination into a singleton
   * <audio> element fed by a MediaStreamAudioDestinationNode. This is
   * the kill-mode-1 defence: a tab audibly playing a media element gets
   * Chrome's "playing media" treatment (no freeze, no discard, media
   * notification), which pure Web Audio output does not.
   *
   * Best-effort: if the stream can't be built or element.play() is
   * refused, the bus is rewired back to direct hardware output and the
   * session sounds exactly like before this feature existed. The element
   * is reused across sessions AND across context recreations — an
   * element that has played once keeps its autoplay trust.
   */
  private async engageElementSink(): Promise<void> {
    if (!this.masterBus || this.elementSinkEngaged || this.elementSinkEngaging) {
      return;
    }
    if (typeof document === 'undefined') return;
    // Claim the in-flight slot synchronously so a concurrent call bails out
    // above instead of reassigning srcObject mid-play() (the AbortError /
    // detached-but-engaged regression).
    this.elementSinkEngaging = true;
    const bus = this.masterBus;
    const stream = bus.attachElementSink();
    if (!stream) {
      this.elementSinkEngaging = false;
      return; // unsupported — direct output still wired
    }
    const el = this.sinkElement ?? document.createElement('audio');
    if (!this.sinkElement) {
      this.sinkElement = el;
      el.addEventListener('pause', () => {
        // Something other than disengage paused the sink (OS media
        // controls without our handler, focus weirdness). Try to resume;
        // if the replay is refused, the bus would otherwise pour audio
        // into a paused element forever — total silence the zombie
        // watchdog can't see, because the context stays 'running' with
        // currentTime advancing (review bug C2). So a refused replay falls
        // back to direct hardware output: sound beats a trapped stream.
        if (!this.elementSinkEngaged) return;
        recordEvent('media-sink-paused', 'pause-event');
        void this.retrySinkPlayOrFallback();
      });
    }
    try {
      el.srcObject = stream;
      // el.play() returns a Promise in real browsers and undefined in the
      // jsdom test shim; awaiting it is safe either way.
      await el.play();
      if (this.masterBus !== bus) return; // context recreated mid-play()
      this.elementSinkEngaged = true;
      recordEvent('media-sink', 'element');
    } catch (err) {
      // Autoplay refusal or transient element failure — fall back to the
      // direct path rather than playing into an inaudible stream.
      if (this.masterBus === bus) bus.detachElementSink();
      recordEvent('media-sink', `fallback: ${String(err).slice(0, 120)}`);
    } finally {
      this.elementSinkEngaging = false;
    }
  }

  private disengageElementSink(): void {
    this.elementSinkEngaged = false;
    this.resetSinkClockTracking();
    if (this.sinkElement) {
      try {
        this.sinkElement.pause();
        this.sinkElement.srcObject = null;
      } catch {
        /* noop */
      }
    }
    this.masterBus?.detachElementSink();
  }

  /**
   * Recover a sink element that was paused out from under us (review bug
   * C2). One replay attempt; if it's refused, detach the sink so the bus
   * reaches hardware directly — sound beats trapping the audio in a paused
   * element the watchdog can't see. No-op when the sink isn't engaged or
   * is already playing. Driven from three places: the element's own
   * 'pause' event, the visibilitychange path, and the watchdog tick.
   */
  private async retrySinkPlayOrFallback(): Promise<void> {
    const el = this.sinkElement;
    if (!el || !this.elementSinkEngaged) return;
    if (!el.paused) return; // already playing — nothing to recover
    try {
      // el.play() returns a Promise in real browsers and undefined in the
      // jsdom test shim; awaiting it is safe either way.
      await el.play();
    } catch {
      // A disengage/recreate may have raced in while play() was pending;
      // only fall back if we're still the engaged sink.
      if (this.elementSinkEngaged) this.fallbackFromElementSink();
    }
  }

  /**
   * Detach the element sink and restore direct hardware output, leaving
   * the silent keep-alive and the rest of the session intact. The element
   * can be re-engaged later (a recreateContext or a fresh startKeepAlive).
   */
  private fallbackFromElementSink(): void {
    this.elementSinkEngaged = false;
    this.masterBus?.detachElementSink();
    recordEvent('media-sink-fallback');
  }

  get isKeepAliveRunning(): boolean {
    return this.keepAlive?.isRunning ?? false;
  }

  /**
   * Soft-pause from a user/OS action (lock-screen or headset pause). Suspend
   * the context and set the userPaused flag so the auto-resume machinery
   * leaves it alone until resumeForUser(). The session itself stays intact
   * (scene, keep-alive, element sink), so this is fully recoverable — the
   * lock-screen Play button or bringing the app to the foreground resumes it
   * (review M4: Andrew chose resumable soft-pause over stop-and-exit).
   */
  async pauseForUser(): Promise<void> {
    if (this.userPaused) return;
    this.userPaused = true;
    recordEvent('user-pause');
    this.emit({ kind: 'user-paused' });
    const ctx = this.ctx;
    if (ctx && (ctx.state as string) === 'running') {
      try {
        await ctx.suspend();
      } catch {
        /* best-effort */
      }
    }
  }

  /** Resume from a soft-pause. Clears the flag and resumes the context. */
  async resumeForUser(): Promise<void> {
    if (!this.userPaused) return;
    this.userPaused = false;
    recordEvent('user-resume');
    this.emit({ kind: 'user-resumed' });
    const ctx = this.ctx;
    if (ctx && (ctx.state as string) !== 'running') {
      try {
        await ctx.resume();
      } catch {
        /* will retry on the next foreground/gesture */
      }
    }
  }

  get isUserPaused(): boolean {
    return this.userPaused;
  }

  addListener(fn: EngineListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /**
   * True when something is (or should be) producing audio: a registered
   * layer (dev harness paths) or the silent keep-alive, which every
   * scene/story session starts. This — NOT the layer registry alone — is
   * the right guard for resume watchdogs: Scene deliberately bypasses
   * the layer registry, so `layers.size` is 0 during normal playback.
   */
  private get hasActiveSession(): boolean {
    return this.layers.size > 0 || (this.keepAlive?.isRunning ?? false);
  }

  /**
   * Tear down the current AudioContext and build a fresh one. This is
   * the recovery path for a context the platform has killed: state stuck
   * in 'suspended'/'interrupted' with resume() failing, or the zombie
   * case where state reads 'running' but the rendering thread is gone
   * (currentTime frozen). Neither recovers without a new context —
   * which is why the app historically needed a full restart.
   *
   * Registered layers hold nodes on the dead context and cannot be
   * migrated; they are disposed and dropped. Scene playback is rebuilt
   * by SceneCoordinator, which listens for the 'context-recreated' event.
   */
  recreateContext(): void {
    const old = this.ctx;
    if (!old) return;
    recordEvent('audio-context-recreate', old.state);
    this.lastRecreateMs = Date.now();
    const keepAliveWasRunning = this.keepAlive?.isRunning ?? false;
    this.keepAlive?.stop();
    this.keepAlive = null;
    // The element sink's stream belongs to the dead context. Clear the
    // engaged flag so the startKeepAlive below re-attaches a fresh stream
    // from the new bus; the element itself is reused (keeps its autoplay
    // trust from the gesture that first played it).
    this.elementSinkEngaged = false;
    this.elementSinkEngaging = false;
    this.resetSinkClockTracking();
    if (this.sinkElement) {
      try {
        this.sinkElement.pause();
        this.sinkElement.srcObject = null;
      } catch {
        /* noop */
      }
    }
    for (const [id, layer] of Array.from(this.layers.entries())) {
      this.layers.delete(id);
      try {
        layer.dispose();
      } catch {
        /* nodes belong to the dead context */
      }
      this.emit({ kind: 'layer-removed', id });
    }
    this.workletReady = false;
    this.workletPromise = null;
    this.masterBus = null;
    this.ctx = null;
    try {
      void old.close().catch(() => undefined);
    } catch {
      /* already closed */
    }
    this.ensureContext();
    if (keepAliveWasRunning) this.startKeepAlive();
    this.emit({ kind: 'context-recreated' });
  }

  private maybeRecreate(): void {
    if (Date.now() - this.lastRecreateMs < RECREATE_MIN_INTERVAL_MS) return;
    this.recreateContext();
  }

  /**
   * Foreground liveness check. Called when the page becomes visible
   * during an active session: resume if not running, then verify the
   * rendering thread is actually advancing currentTime. Recreates the
   * context (rate-limited) if either check fails. This is what brings
   * sound back when the user opens the app to a dead overnight session,
   * without requiring them to kill and restart the app.
   */
  private async verifyContextAlive(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.verifyInFlight || !this.hasActiveSession || this.userPaused)
      return;
    this.verifyInFlight = true;
    try {
      if ((ctx.state as string) !== 'running') {
        try {
          await resumeWithTimeout(ctx, RESUME_TIMEOUT_MS);
        } catch {
          /* fall through to the checks below */
        }
      }
      if (this.ctx !== ctx) return; // recreated elsewhere meanwhile
      if ((ctx.state as string) !== 'running') {
        this.maybeRecreate();
        return;
      }
      const t0 = ctx.currentTime;
      await wait(LIVENESS_PROBE_MS);
      if (this.ctx !== ctx) return;
      if (document.visibilityState !== 'visible') return;
      if (ctx.currentTime === t0) this.maybeRecreate();
    } finally {
      this.verifyInFlight = false;
    }
  }

  private installVisibilityHandler(): void {
    if (this.visibilityHandlerInstalled) return;
    this.visibilityHandlerInstalled = true;
    const tryResume = () => {
      const ctx = this.ctx;
      if (!ctx || this.userPaused) return;
      // Anything other than 'running' gets a resume attempt — this
      // covers iOS Safari's non-standard 'interrupted' state too.
      if ((ctx.state as string) !== 'running') {
        ctx.resume().catch(() => {
          /* will retry on next event */
        });
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Bringing the app to the foreground is a resume intent: undo a
        // soft-pause rather than leaving the user staring at a silent scene.
        if (this.userPaused) {
          void this.resumeForUser();
          return;
        }
        tryResume();
        void this.verifyContextAlive();
        // A return-to-foreground is a fresh chance to re-arm a sink the OS
        // paused while we were hidden (bug C2, layer b).
        void this.retrySinkPlayOrFallback();
      }
    });
    window.addEventListener('focus', () => {
      if (this.userPaused) {
        void this.resumeForUser();
        return;
      }
      tryResume();
    });
    setInterval(() => this.watchdogTick(), 2000);
  }

  /**
   * Watchdog, every 2s during an active session (timers are throttled
   * when hidden — that just stretches the tick interval, which is fine).
   * Two jobs:
   *  1. resume() a context that admits it isn't running;
   *  2. catch the zombie that DOESN'T admit it — state 'running' with a
   *     frozen currentTime — by comparing the clock across ticks, and
   *     rebuild the context mid-night without waiting for the user.
   *
   * Job 2 exists because of the 2026-06-11 overnight incident: the log
   * showed the page awake all night (no freeze), the context claiming
   * 'running' the whole time, and the watchdog's resume() no-oping
   * against a dead rendering thread until the user opened the app at
   * 12:50 and the foreground probe finally caught it. Two consecutive
   * stagnant ticks (≥4s of frozen clock while 'running') cannot happen
   * on a healthy context — it advances every render quantum (~2.7ms).
   */
  private watchdogTick(): void {
    const ctx = this.ctx;
    // While the user has soft-paused, the context is intentionally suspended
    // — the watchdog must not resume it or trip the zombie detector on the
    // (legitimately) frozen clock (review M4).
    if (!ctx || !this.hasActiveSession || this.userPaused) {
      this.stagnantTicks = 0;
      this.lastWatchdogCurrentTime = -1;
      return;
    }
    if ((ctx.state as string) !== 'running') {
      // A suspended/interrupted context legitimately freezes its clock —
      // that's resume()'s job, not the zombie detector's.
      this.stagnantTicks = 0;
      this.lastWatchdogCurrentTime = -1;
      ctx.resume().catch(() => {
        /* will retry on next tick */
      });
      return;
    }
    if (ctx.currentTime === this.lastWatchdogCurrentTime) {
      this.stagnantTicks++;
      if (this.stagnantTicks >= 2) {
        this.stagnantTicks = 0;
        this.lastWatchdogCurrentTime = -1;
        this.maybeRecreate();
        return;
      }
    } else {
      this.stagnantTicks = 0;
    }
    this.lastWatchdogCurrentTime = ctx.currentTime;

    this.checkElementSinkHealth();
  }

  /**
   * Element-sink health, on the watchdog's cadence. The context is 'running'
   * and its clock advances; the sink is the remaining way audio dies
   * invisibly:
   *   (a) the <audio> element is paused — re-attempt play / fall back to
   *       direct output (review bug C2);
   *   (b) the element is NOT paused but its OWN clock has frozen while the
   *       context clock keeps ticking — the MediaStream silently stopped
   *       feeding the speaker, the documented blind spot that killed audio
   *       overnight with the context still looking healthy. Re-engage the
   *       sink to recover.
   * The element-clock signal is only trusted once we've seen it advance —
   * some engines never advance currentTime for a live MediaStream, and we
   * must not false-trigger on that. A one-time 'media-sink-clock' log records
   * which case this device is, so the behaviour is verifiable from a log.
   */
  private checkElementSinkHealth(): void {
    const el = this.sinkElement;
    if (!this.elementSinkEngaged || !el) return;

    if (el.paused) {
      this.sinkLastCurrentTime = -1;
      this.sinkStallTicks = 0;
      void this.retrySinkPlayOrFallback();
      return;
    }

    const t = el.currentTime;
    if (this.sinkLastCurrentTime >= 0) {
      if (t > this.sinkLastCurrentTime) {
        this.sinkClockAdvancedEver = true;
        this.sinkStallTicks = 0;
      } else if (this.sinkClockAdvancedEver) {
        // Frozen after having advanced → a genuine stall.
        this.sinkStallTicks++;
        if (this.sinkStallTicks >= SINK_STALL_TICKS) {
          this.sinkStallTicks = 0;
          recordEvent('media-sink-stall', `ct=${t.toFixed(1)}`);
          this.reengageElementSink();
          return;
        }
      }
    }
    this.sinkLastCurrentTime = t;

    // One-time diagnostic per engage: tells us whether the element clock is
    // even a usable signal on this device.
    if (!this.sinkClockLogged && ++this.sinkSampleCount >= 5) {
      this.sinkClockLogged = true;
      recordEvent(
        'media-sink-clock',
        `ct=${t.toFixed(2)} advanced=${this.sinkClockAdvancedEver}`
      );
    }
  }

  /**
   * Recover a silently stalled element sink by tearing it down and
   * re-engaging it fresh. Rate-limited so a sink that keeps stalling can't
   * thrash the graph; if it can't recover, the lifecycle log shows repeated
   * 'media-sink-stall' entries to diagnose from.
   */
  private reengageElementSink(): void {
    const now = Date.now();
    if (now - this.lastSinkReengageMs < SINK_REENGAGE_MIN_INTERVAL_MS) return;
    this.lastSinkReengageMs = now;
    recordEvent('media-sink-reengage');
    this.disengageElementSink();
    void this.engageElementSink();
  }

  private resetSinkClockTracking(): void {
    this.sinkLastCurrentTime = -1;
    this.sinkStallTicks = 0;
    this.sinkClockAdvancedEver = false;
    this.sinkSampleCount = 0;
    this.sinkClockLogged = false;
  }
}

function resumeWithTimeout(ctx: AudioContext, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`resume() still pending after ${ms}ms`)),
      ms
    );
    ctx.resume().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LayerCapExceededError extends Error {
  constructor(public readonly currentCount: number) {
    super(
      `Layer soft cap reached (${currentCount}/${AudioEngine.LAYER_SOFT_CAP}). ` +
        `Remove a layer or pass { allowOverCap: true } to bypass.`
    );
    this.name = 'LayerCapExceededError';
  }
}

let engine: AudioEngine | null = null;
export function getAudioEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}
