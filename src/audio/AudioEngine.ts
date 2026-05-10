// AudioEngine -- the AudioContext lifecycle manager and layer registry.
//
// Owns the AudioContext, the master bus, the AudioWorklet module
// registration, and the registry of active layers. Handles the gnarly
// mobile-browser lifecycle: user-gesture unlock, suspend/resume on
// visibilitychange/focus, and an iOS priming buffer.

import { MasterBus } from './MasterBus';
import type { Layer } from './types';

export type EngineEvent =
  | { kind: 'state'; state: AudioContextState }
  | { kind: 'layer-added'; id: string }
  | { kind: 'layer-removed'; id: string };

export type EngineListener = (e: EngineEvent) => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterBus: MasterBus | null = null;
  private workletReady = false;
  private workletPromise: Promise<void> | null = null;
  private layers = new Map<string, Layer>();
  private listeners = new Set<EngineListener>();
  private visibilityHandlerInstalled = false;

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
    ctx.addEventListener('statechange', () => {
      this.emit({ kind: 'state', state: ctx.state });
    });
    return ctx;
  }

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('[AudioEngine] resume failed:', err);
      }
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
      throw new Error('AudioWorklet not supported in this browser.');
    }
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    this.workletPromise = ctx.audioWorklet
      .addModule(`${base}/worklets/noise-processor.js`)
      .then(() => {
        this.workletReady = true;
      });
    return this.workletPromise;
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

  async removeLayer(id: string): Promise<void> {
    const layer = this.layers.get(id);
    if (!layer) return;
    await layer.stop();
    try {
      layer.output.disconnect();
    } catch {
      /* noop */
    }
    layer.dispose();
    this.layers.delete(id);
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

  addListener(fn: EngineListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  private installVisibilityHandler(): void {
    if (this.visibilityHandlerInstalled) return;
    this.visibilityHandlerInstalled = true;
    const tryResume = () => {
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {
          /* will retry on next event */
        });
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tryResume();
    });
    window.addEventListener('focus', tryResume);
    setInterval(() => {
      if (this.ctx && this.layers.size > 0) tryResume();
    }, 2000);
  }
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
