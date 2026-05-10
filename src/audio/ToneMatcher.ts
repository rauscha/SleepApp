// ToneMatcher — pure sine for tinnitus pitch calibration.
//
// From §9 of the brief: a slider 2–12 kHz with logarithmic spacing, a
// "Play tone" button playing a pure sine at the chosen frequency at
// LOW volume, and a save action.
//
// Two important details:
//   1. The sine must start AND stop with a short envelope (~30 ms) so
//      there is no on/off click. A click defeats the One Thing — it
//      can wake a half-asleep user even at low volume.
//   2. Volume should default low (~0.1) so the tone is comfortable
//      to compare against real tinnitus, which is also typically faint.

export class ToneMatcher {
  private readonly ctx: AudioContext;
  private readonly destination: AudioNode;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private currentFrequency = 8000;
  private currentVolume = 0.1;
  private playing = false;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
  }

  setFrequency(hz: number): void {
    const f = clamp(hz, 2000, 12000);
    this.currentFrequency = f;
    if (this.osc) {
      const now = this.ctx.currentTime;
      // Short ramp instead of an instant jump — avoids "chirp" artefacts
      // when the user drags the slider quickly.
      this.osc.frequency.cancelScheduledValues(now);
      this.osc.frequency.setValueAtTime(this.osc.frequency.value, now);
      this.osc.frequency.linearRampToValueAtTime(f, now + 0.04);
    }
  }

  getFrequency(): number {
    return this.currentFrequency;
  }

  setVolume(value: number): void {
    const v = clamp(value, 0, 1);
    this.currentVolume = v;
    if (this.gain) {
      const now = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(this.gain.gain.value, now);
      this.gain.gain.linearRampToValueAtTime(v, now + 0.03);
    }
  }

  getVolume(): number {
    return this.currentVolume;
  }

  start(): void {
    if (this.playing) return;
    const now = this.ctx.currentTime;
    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sine';
    this.osc.frequency.value = this.currentFrequency;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.osc.connect(this.gain).connect(this.destination);
    this.osc.start();
    // Attack envelope — 30 ms ramp from 0 to volume.
    this.gain.gain.linearRampToValueAtTime(this.currentVolume, now + 0.03);
    this.playing = true;
  }

  async stop(): Promise<void> {
    if (!this.playing || !this.osc || !this.gain) return;
    const now = this.ctx.currentTime;
    const releaseSec = 0.04;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + releaseSec);
    this.osc.stop(now + releaseSec + 0.01);
    const osc = this.osc;
    const gain = this.gain;
    this.osc = null;
    this.gain = null;
    this.playing = false;
    await wait((releaseSec + 0.02) * 1000);
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      /* noop */
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Logarithmic mapping for slider position [0,1] → frequency [2k, 12k].
   * Equal-perceptual steps: a slider movement near 12 kHz changes pitch
   * by roughly the same musical interval as a movement near 2 kHz.
   */
  static sliderToHz(t: number): number {
    const c = clamp(t, 0, 1);
    const minLog = Math.log2(2000);
    const maxLog = Math.log2(12000);
    return Math.pow(2, minLog + (maxLog - minLog) * c);
  }

  static hzToSlider(hz: number): number {
    const f = clamp(hz, 2000, 12000);
    const minLog = Math.log2(2000);
    const maxLog = Math.log2(12000);
    return (Math.log2(f) - minLog) / (maxLog - minLog);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
