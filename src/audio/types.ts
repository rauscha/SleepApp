// Shared types for the audio engine.
//
// The mixer treats every active sound source as a "Layer". Each Layer owns its
// own internal graph (sources, filters, gain) and exposes a single output
// AudioNode that the mixer connects to the master bus. Layers run on their own
// clocks — the mixer never tells them when to schedule events.

export type NoiseColor = 'white' | 'pink' | 'brown';

/** A self-contained sound source connected to the master bus. */
export interface Layer {
  /** Stable id within the engine (e.g. 'synth-bed', 'tinnitus-mask', 'forest-creek'). */
  readonly id: string;

  /** Human-readable label for UI. */
  readonly label: string;

  /** The output node — connect this to the master bus. Stable for the layer's lifetime. */
  readonly output: AudioNode;

  /** Start producing audio. Idempotent — calling twice has no extra effect. */
  start(): void;

  /** Stop producing audio. Should fade-down internally so there's no click. */
  stop(): Promise<void>;

  /** Set this layer's volume in [0, 1]. Smoothed internally so changes don't click. */
  setVolume(value: number): void;

  /** Current volume in [0, 1]. */
  getVolume(): number;

  /** True after start() until stop() resolves. */
  isPlaying(): boolean;

  /** Free all resources. After dispose(), the layer cannot be restarted. */
  dispose(): void;
}

/** Equal-power crossfade gain values for a normalized progress t in [0,1]. */
export interface CrossfadeGains {
  /** Gain for the outgoing source. */
  out: number;
  /** Gain for the incoming source. */
  in: number;
}
