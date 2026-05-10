// Diagnostic spectrum analyser.
//
// Tap into the master bus to read the live frequency spectrum. Used by the
// dev harness to verify, by eye, that:
//   - white noise is roughly flat
//   - pink noise rolls off ~3 dB/octave
//   - brown noise rolls off ~6 dB/octave
//   - the tinnitus mask layer shows a peak at the calibrated frequency
//
// Pure diagnostic — not on the audio path itself; just a parallel branch.

export class SpectrumAnalyser {
  readonly node: AnalyserNode;
  private readonly buffer: Uint8Array;

  constructor(ctx: AudioContext, fftSize = 1024) {
    this.node = ctx.createAnalyser();
    this.node.fftSize = fftSize;
    this.node.smoothingTimeConstant = 0.7;
    this.buffer = new Uint8Array(this.node.frequencyBinCount);
  }

  /** Returns a fresh frequency-domain snapshot in [0, 255] per bin. */
  snapshot(): Uint8Array {
    this.node.getByteFrequencyData(this.buffer);
    return this.buffer;
  }

  /** Frequency at a given bin index. */
  binFrequency(bin: number, sampleRate: number): number {
    return (bin * sampleRate) / this.node.fftSize;
  }
}
