// Silent keep-alive — a 1-second buffer of zeros routed through the master
// bus that loops continuously while a scene is playing.
//
// Why: Android Chrome's audio focus heuristic suspends an AudioContext that
// has been "silent" for a stretch — even though our scene scheduler is
// constantly pushing sample-accurate audio, the heuristic can lose the
// thread when the tab goes to background and the worklet processor block
// rate drops. A continuously-scheduled loop source guarantees the engine
// sees the AudioContext as actively producing samples, which keeps the
// platform-level audio session pinned.
//
// The buffer is all zeros, so it adds nothing audible. It connects to the
// master bus *input*, so the master limiter / analyser / gain chain still
// processes it like any other layer — that's what convinces the platform
// it's a live producer, not just a stale node hanging off destination.
//
// Belt-and-suspenders w.r.t. the visibility-handler resume loop in
// AudioEngine: the resume loop wakes a suspended context, this prevents
// the suspension in the first place.

export class SilentKeepAlive {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode
  ) {}

  /** Idempotent — calling start() twice is a no-op on the second call. */
  start(): void {
    if (this.source) return;
    // 1-second mono buffer of zeros. Browsers happily loop a 1s buffer
    // forever without any audible artifact since the contents are silent.
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // Belt: feed through a zeroed gain node anyway so even if the buffer
    // ever picks up a sample of garbage, nothing escapes to the bus.
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.destination);
    src.start();
    this.source = src;
    this.gain = gain;
  }

  stop(): void {
    const src = this.source;
    const gain = this.gain;
    this.source = null;
    this.gain = null;
    if (!src) return;
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    try {
      src.disconnect();
    } catch {
      /* noop */
    }
    try {
      gain?.disconnect();
    } catch {
      /* noop */
    }
  }

  get isRunning(): boolean {
    return this.source !== null;
  }
}
