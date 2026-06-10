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
  | { kind: 'layer-removed'; id: string };

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
  }

  /** Stop the silent keep-alive loop. Safe to call when not started. */
  stopKeepAlive(): void {
    this.keepAlive?.stop();
  }

  get isKeepAliveRunning(): boolean {
    return this.keepAlive?.isRunning ?? false;
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
    if (!ctx || this.verifyInFlight || !this.hasActiveSession) return;
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
      if (!ctx) return;
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
        tryResume();
        void this.verifyContextAlive();
      }
    });
    window.addEventListener('focus', tryResume);
    setInterval(() => {
      if (this.ctx && this.hasActiveSession) tryResume();
    }, 2000);
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
