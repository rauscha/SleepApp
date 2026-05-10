// Noise-generator AudioWorklet.
//
// IMPORTANT: This file is plain JavaScript (NOT TypeScript) and is served
// as a static asset from /public/worklets/. AudioWorklet modules are loaded
// via audioWorklet.addModule(url) and run in a separate AudioWorkletGlobalScope
// — they cannot be bundled into the main app graph. Keeping this file as
// .js avoids any worklet-specific TS/ESM build complexity.
//
// Generates infinite white, pink, or brown noise, sample by sample. Because
// every sample is freshly computed, there is no loop and no seam — ever.
// This is the foundation of the One Thing for synth layers.
//
// Algorithms:
//   white: uniform [-1, 1] random per sample.
//   pink:  Voss-McCartney algorithm with 16 octaves of running sums. This
//          approximates 1/f spectral density extremely closely with O(1)
//          per-sample cost. Output is normalized so peak ~ ±1.
//   brown: Leaky integrator over white noise (1/f^2). A small leak factor
//          (0.997) prevents DC drift over hours. Scaled to ~ ±0.5 so it
//          doesn't clip when summed with other layers.

class NoiseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Per-sample gain in [0, 1]. We expose this so noise can be silenced
      // smoothly via AudioParam scheduling without an external GainNode.
      { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
    ];
  }

  /**
   * @param {AudioWorkletNodeOptions} options
   */
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.color = opts.color || 'white';

    // Voss-McCartney state (pink).
    // 16 rows of summed white noise; each row updates at a halved rate.
    this.pinkRows = new Float32Array(16);
    this.pinkRunningSum = 0;
    this.pinkCounter = 0;

    // Brown noise state.
    this.brownLast = 0;

    // Listen for color changes from the main thread.
    this.port.onmessage = (event) => {
      const data = event.data;
      if (data && typeof data === 'object' && data.type === 'setColor') {
        this.color = data.color;
      }
    };
  }

  /**
   * Voss-McCartney pink noise.
   * For each output sample: increment a counter; the index of the lowest
   * set bit tells us which row to refresh with a fresh white noise sample.
   * Sum of all 16 rows ≈ 1/f spectrum.
   */
  nextPink() {
    this.pinkCounter = (this.pinkCounter + 1) & 0xffff;
    // Find the lowest bit set — that's the row to update.
    // (For counter==0, refresh row 0 by convention.)
    let row = 0;
    let c = this.pinkCounter;
    if (c !== 0) {
      while ((c & 1) === 0) {
        row++;
        c >>= 1;
      }
      if (row > 15) row = 15;
    }
    const newVal = Math.random() * 2 - 1;
    this.pinkRunningSum -= this.pinkRows[row];
    this.pinkRunningSum += newVal;
    this.pinkRows[row] = newVal;
    // Add a fresh white sample on top so high-frequency content isn't lost.
    const sample = (this.pinkRunningSum + (Math.random() * 2 - 1)) / 8;
    return sample; // ~ ±1
  }

  /**
   * Brown noise via leaky integrator: y[n] = 0.997*y[n-1] + 0.05*white.
   * Coefficients chosen to give ~1/f^2 spectrum without runaway DC.
   */
  nextBrown() {
    const white = Math.random() * 2 - 1;
    this.brownLast = 0.997 * this.brownLast + 0.05 * white;
    return this.brownLast * 3.5; // scale up to a useful level (~ ±0.5)
  }

  /**
   * @param {Float32Array[][]} _inputs
   * @param {Float32Array[][]} outputs
   * @param {Record<string, Float32Array>} parameters
   */
  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    const gainParam = parameters.gain;
    const channelCount = output.length;
    const frameCount = output[0].length;

    for (let i = 0; i < frameCount; i++) {
      const g = gainParam.length > 1 ? gainParam[i] : gainParam[0];
      let s;
      if (this.color === 'white') {
        s = (Math.random() * 2 - 1) * 0.5;
      } else if (this.color === 'pink') {
        s = this.nextPink();
      } else {
        s = this.nextBrown();
      }
      const v = s * g;
      // Mono output broadcast to all channels (stereo by default).
      for (let ch = 0; ch < channelCount; ch++) {
        output[ch][i] = v;
      }
    }
    return true; // keep the processor alive
  }
}

registerProcessor('noise-processor', NoiseProcessor);
