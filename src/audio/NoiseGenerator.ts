// NoiseGenerator — the synth bed Layer.
//
// Wraps the noise-processor AudioWorklet behind the Layer interface.
// The "always-on option" from the brief (§3.1.1): white/pink/brown noise
// generated mathematically, infinite by definition, no loop seam possible.
//
// Volume is controlled via a downstream GainNode, not the worklet's own
// gain AudioParam — that way changes are smoothed via linearRampToValueAtTime
// from the main thread, with no timing dependency on the worklet.

import type { AudioEngine } from './AudioEngine';
import type { Layer, NoiseColor } from './types';

export class NoiseGenerator implements Layer {
  readonly id: string;
  readonly label: string;
  readonly output: GainNode;

  private readonly engine: AudioEngine;
  private readonly ctx: AudioContext;
  private node: AudioWorkletNode | null = null;
  private color: NoiseColor;
  private playing = false;
  private currentVolume = 0;
  private hasUserSetVolume = false;
  private readonly targetVolume: number = 0.5;

  constructor(
    engine: AudioEngine,
    opts: { id?: string; label?: string; color?: NoiseColor; defaultVolume?: number } = {}
  ) {
    this.engine = engine;
    this.ctx = engine.context;
    this.id = opts.id ?? 'synth-bed';
    this.label = opts.label ?? 'Synth bed';
    this.color = opts.color ?? 'pink';
    this.targetVolume = opts.defaultVolume ?? 0.5;

    // Output gain node: how the layer attaches to the master bus.
    this.output = this.ctx.createGain();
    this.output.gain.value = 0;
  }

  setColor(color: NoiseColor): void {
    this.color = color;
    if (this.node) {
      this.node.port.postMessage({ type: 'setColor', color });
    }
  }

  getColor(): NoiseColor {
    return this.color;
  }

  start(): void {
    if (this.playing) return;
    if (!this.engine.isWorkletReady) {
      throw new Error('NoiseGenerator: worklet not loaded. Call engine.loadNoiseWorklet() first.');
    }
    // Stereo output keeps it consistent with file layers.
    this.node = new AudioWorkletNode(this.ctx, 'noise-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { color: this.color },
    });
    this.node.connect(this.output);
    this.playing = true;
    // Default to targetVolume only on the very first start, before the user
    // has explicitly chosen a level. A subsequent setVolume(0) must be
    // honoured — `||` would silently restore 0.5%.
    const initial = this.hasUserSetVolume ? this.currentVolume : this.targetVolume;
    this.currentVolume = initial;
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    this.output.gain.linearRampToValueAtTime(initial, now + 0.05);
  }

  async stop(): Promise<void> {
    if (!this.playing) return;
    // Fade out smoothly (no click). 200 ms is fast but click-free.
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
    const v = Math.max(0, Math.min(1, value));
    this.currentVolume = v;
    this.hasUserSetVolume = true;
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    // Long-ish ramp avoids zipper noise on slider drags.
    this.output.gain.linearRampToValueAtTime(v, now + 0.05);
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
      this.output.disconnect();
    } catch {
      /* noop */
    }
    this.playing = false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
