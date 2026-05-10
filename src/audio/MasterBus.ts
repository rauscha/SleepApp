// Master bus: master gain -> soft limiter -> destination, with a parallel
// AnalyserNode tap for diagnostics.

export class MasterBus {
  readonly input: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly analyser: AnalyserNode;
  private readonly ctx: AudioContext;

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
