// Master bus: master gain -> soft limiter -> destination, with a parallel
// AnalyserNode tap for diagnostics.
//
// The final hop is switchable: directly into ctx.destination (default), or
// into a MediaStreamAudioDestinationNode whose stream an <audio> element
// plays (see AudioEngine's element sink). The element route exists because
// Android Chrome only grants "actively playing media" protection — no tab
// freeze, no discard, media notification — to real media elements; pure
// Web Audio output is fair game for the overnight tab killer.

export class MasterBus {
  readonly input: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly analyser: AnalyserNode;
  private readonly ctx: AudioContext;
  private streamDest: MediaStreamAudioDestinationNode | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.input.gain.value = 1.0;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.7;

    this.input.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  /**
   * Reroute the bus tail into a MediaStream so an <audio> element can be
   * the audible output. Returns null when the context can't produce one
   * (no createMediaStreamDestination — old browser or test mock), in
   * which case the direct ctx.destination wiring is left untouched.
   * EXCLUSIVE routing: the analyser feeds either the stream or the
   * hardware destination, never both — double-routing would double the
   * output level.
   */
  attachElementSink(): MediaStream | null {
    const ctx = this.ctx as AudioContext & {
      createMediaStreamDestination?: () => MediaStreamAudioDestinationNode;
    };
    if (typeof ctx.createMediaStreamDestination !== 'function') return null;
    if (!this.streamDest) this.streamDest = ctx.createMediaStreamDestination();
    try {
      this.analyser.disconnect();
    } catch {
      /* not connected */
    }
    this.analyser.connect(this.streamDest);
    return this.streamDest.stream;
  }

  /** Restore direct hardware output (the constructor wiring). */
  detachElementSink(): void {
    try {
      this.analyser.disconnect();
    } catch {
      /* not connected */
    }
    this.analyser.connect(this.ctx.destination);
  }

  setMasterVolume(value: number, rampSeconds = 0.05): void {
    const v = Math.max(0, Math.min(1, value));
    const now = this.ctx.currentTime;
    this.input.gain.cancelScheduledValues(now);
    this.input.gain.setValueAtTime(this.input.gain.value, now);
    this.input.gain.linearRampToValueAtTime(v, now + rampSeconds);
  }

  fadeToSilence(durationSeconds: number): void {
    const now = this.ctx.currentTime;
    const current = this.input.gain.value;
    const tau = durationSeconds / 5;
    this.input.gain.cancelScheduledValues(now);
    this.input.gain.setValueAtTime(current, now);
    this.input.gain.setTargetAtTime(0, now, tau);
    this.input.gain.setValueAtTime(0, now + durationSeconds);
  }

  cancelFade(targetVolume = 1, rampSeconds = 0.5): void {
    const now = this.ctx.currentTime;
    this.input.gain.cancelScheduledValues(now);
    this.input.gain.setValueAtTime(this.input.gain.value, now);
    this.input.gain.linearRampToValueAtTime(targetVolume, now + rampSeconds);
  }

  get reductionDb(): number {
    return this.limiter.reduction;
  }
}
