// TinnitusMaskLayer — band-passed white noise centered on the user's tinnitus
// frequency. Independent volume slider (defaults low: 20%, per brief §3.4).
//
// Architecture: white-noise AudioWorkletNode → BiquadFilterNode (bandpass)
// → output GainNode. The bandpass center frequency is configured per the
// user's matched tinnitus frequency. Bandwidth is expressed via Q where
// Q = centerFreq / bandwidth — bandwidth ±200 Hz is the suggested default.

import type { AudioEngine } from './AudioEngine';
import type { Layer } from './types';

export interface TinnitusMaskOptions {
  id?: string;
  label?: string;
  centerHz?: number;       // default: 8000
  bandwidthHz?: number;    // default: 400 (i.e. ±200)
  defaultVolume?: number;  // default: 0.2
}

export class TinnitusMaskLayer implements Layer {
  readonly id: string;
  readonly label: string;
  readonly output: GainNode;

  private readonly engine: AudioEngine;
  private readonly ctx: AudioContext;
  private node: AudioWorkletNode | null = null;
  private filter: BiquadFilterNode;
  private centerHz: number;
  private bandwidthHz: number;
  private currentVolume: number;
  private playing = false;

  constructor(engine: AudioEngine, opts: TinnitusMaskOptions = {}) {
    this.engine = engine;
    this.ctx = engine.context;
    this.id = opts.id ?? 'tinnitus-mask';
    this.label = opts.label ?? 'Tinnitus mask';
    this.centerHz = opts.centerHz ?? 8000;
    this.bandwidthHz = opts.bandwidthHz ?? 400;
    this.currentVolume = opts.defaultVolume ?? 0.2;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.applyFilter();

    this.output = this.ctx.createGain();
    this.output.gain.value = 0;
    this.filter.connect(this.output);
  }

  private applyFilter(): void {
    this.filter.frequency.value = this.centerHz;
    // Q = center / bandwidth. Higher Q = narrower band.
    this.filter.Q.value = Math.max(0.5, this.centerHz / Math.max(50, this.bandwidthHz));
  }

  setCenterFrequency(hz: number): void {
    this.centerHz = clamp(hz, 1000, 14000);
    const now = this.ctx.currentTime;
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
    this.filter.frequency.linearRampToValueAtTime(this.centerHz, now + 0.05);
    // Q tracks center to keep the same Hz bandwidth.
    const q = Math.max(0.5, this.centerHz / Math.max(50, this.bandwidthHz));
    this.filter.Q.setTargetAtTime(q, now, 0.02);
  }

  setBandwidth(hz: number): void {
    this.bandwidthHz = clamp(hz, 50, 2000);
    const q = Math.max(0.5, this.centerHz / this.bandwidthHz);
    const now = this.ctx.currentTime;
    this.filter.Q.setTargetAtTime(q, now, 0.02);
  }

  getCenterFrequency(): number {
    return this.centerHz;
  }

  getBandwidth(): number {
    return this.bandwidthHz;
  }

  start(): void {
    if (this.playing) return;
    if (!this.engine.isWorkletReady) {
      throw new Error('TinnitusMaskLayer: worklet not loaded.');
    }
    this.node = new AudioWorkletNode(this.ctx, 'noise-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { color: 'white' },
    });
    this.node.connect(this.filter);
    this.playing = true;
    this.setVolume(this.currentVolume);
  }

  async stop(): Promise<void> {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    this.output.gain.linearRampToValueAtTime(0, now + 0.2);
    await wait(220);
    if (this.node) {
      try {
        this.node.disconnect();
      } catch {
        /* noop */
      }
      this.node = null;
    }
    this.playing = false;
  }

  setVolume(value: number): void {
    this.currentVolume = clamp(value, 0, 1);
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    this.output.gain.linearRampToValueAtTime(this.currentVolume, now + 0.05);
  }

  getVolume(): number {
    return this.currentVolume;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  dispose(): void {
    if (this.node) {
      try {
        this.node.disconnect();
      } catch {
        /* noop */
      }
      this.node = null;
    }
    try {
      this.filter.disconnect();
    } catch {
      /* noop */
    }
    try {
      this.output.disconnect();
    } catch {
      /* noop */
    }
    this.playing = false;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
