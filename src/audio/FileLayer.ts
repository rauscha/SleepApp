// FileLayer — a recorded audio file looped seamlessly with equal-power
// crossfade.
//
// This is the file-based half of the audio engine (the synth half is
// handled by NoiseGenerator/TinnitusMaskLayer). The brief specifies that
// every file layer must:
//   - crossfade into itself with at least 5 seconds of overlap (so the
//     loop seam is inaudible)
//   - rotate through 2–4 variant recordings if available
//   - have its own volume slider
//   - run on its own clock — different layers in the same scene use
//     prime-number-adjacent durations (4:13, 6:47, 8:31...) so the
//     combined pattern doesn't repeat for hours (Brian Eno *Music for
//     Airports* technique). The duration is encoded in the variant's
//     `loopOffsetSeconds` (when to start the next iteration relative to
//     the previous one).
//
// Implementation strategy: we use raw Web Audio (NOT Howler for this
// piece), because we need precise control over scheduling
// AudioBufferSourceNodes at exact AudioContext times, and Howler's API
// abstracts that away. Howler is great for "play a sound" but we need
// "schedule overlapping sources at sample-accurate times".
//
// The loop is driven by chained scheduling: when iteration N starts,
// we schedule iteration N+1 to start at (N's start time + N's loopLength
// - crossfadeSeconds). Equal-power gain ramps are scheduled on each
// iteration's gain node. A safety setTimeout queues the next chain step.

import { scheduleEqualPowerCrossfade } from './crossfade';
import type { AudioEngine } from './AudioEngine';
import type { Layer } from './types';

/** A single audio recording that can be used in a variant pool. */
export interface AudioVariant {
  /** Short identifier — used for diagnostics. */
  id: string;
  /** The decoded audio data. */
  buffer: AudioBuffer;
  /**
   * How long to play this buffer before starting the next iteration.
   * In seconds. Should be less than the buffer's duration so the next
   * iteration can crossfade in over the tail of the current one.
   *
   * For incommensurate looping across layers in a scene, each LAYER picks
   * a different prime-adjacent duration here (e.g. 4:13, 6:47, 8:31, 11:29,
   * 14:53). Variants within a single layer can share the layer's duration.
   */
  loopOffsetSeconds: number;
}

export interface FileLayerOptions {
  id: string;
  label: string;
  variants: AudioVariant[];
  /** Crossfade overlap in seconds. Brief minimum: 5. */
  crossfadeSeconds?: number;
  /** Default volume in [0, 1]. */
  defaultVolume?: number;
  /**
   * Variant rotation policy.
   *  - 'sequential': cycle through variants in order
   *  - 'random': pick a variant at random each iteration (avoiding the
   *              one just played, when possible)
   * Default: 'random'.
   */
  variantRotation?: 'sequential' | 'random';
}

interface LiveSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** AudioContext time at which playback started. */
  startedAt: number;
  /** This iteration's loop offset (when the next one is due to start). */
  loopOffset: number;
}

export class FileLayer implements Layer {
  readonly id: string;
  readonly label: string;
  readonly output: GainNode;

  private readonly ctx: AudioContext;
  private readonly variants: AudioVariant[];
  private readonly crossfadeSeconds: number;
  private readonly variantRotation: 'sequential' | 'random';

  private currentVolume: number;
  private playing = false;
  private nextVariantIndex = 0;
  private lastVariantIndex = -1;
  private liveSources: LiveSource[] = [];
  private nextScheduleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(engine: AudioEngine, opts: FileLayerOptions) {
    if (opts.variants.length === 0) {
      throw new Error(`FileLayer "${opts.id}" needs at least one variant.`);
    }
    this.ctx = engine.context;
    this.id = opts.id;
    this.label = opts.label;
    this.variants = opts.variants;
    this.crossfadeSeconds = Math.max(0.5, opts.crossfadeSeconds ?? 5);
    this.variantRotation = opts.variantRotation ?? 'random';
    this.currentVolume = opts.defaultVolume ?? 0.7;

    this.output = this.ctx.createGain();
    this.output.gain.value = this.currentVolume;

    // Sanity check: the loop offset must be longer than the crossfade,
    // otherwise we'd start iteration N+2 before iteration N+1 has even
    // begun. This is a programmer error — surface it loudly.
    for (const v of this.variants) {
      if (v.loopOffsetSeconds <= this.crossfadeSeconds) {
        throw new Error(
          `FileLayer "${this.id}": variant "${v.id}" loopOffset ` +
            `(${v.loopOffsetSeconds}s) must be greater than crossfade ` +
            `(${this.crossfadeSeconds}s).`
        );
      }
      if (v.buffer.duration < v.loopOffsetSeconds + this.crossfadeSeconds) {
        throw new Error(
          `FileLayer "${this.id}": variant "${v.id}" buffer duration ` +
            `(${v.buffer.duration.toFixed(2)}s) is too short for loopOffset ` +
            `${v.loopOffsetSeconds}s + crossfade ${this.crossfadeSeconds}s.`
        );
      }
    }
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.scheduleIteration(this.ctx.currentTime, /* isFirst */ true);
  }

  /**
   * Schedule one playback iteration starting at `startTime`. Sets up the
   * follow-up timer that will schedule the NEXT iteration at the right
   * moment so they overlap by `crossfadeSeconds`.
   */
  private scheduleIteration(startTime: number, isFirst: boolean): void {
    const variant = this.pickNextVariant();
    const source = this.ctx.createBufferSource();
    source.buffer = variant.buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.output);

    // Schedule playback start exactly at startTime.
    source.start(startTime);

    // Schedule fade-in (and fade-out for the previous iteration if any).
    const prev = this.liveSources[this.liveSources.length - 1];
    if (isFirst || !prev) {
      // First iteration: just fade in alone, no outgoing partner.
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1, startTime + this.crossfadeSeconds);
    } else {
      // Crossfade with the outgoing iteration.
      scheduleEqualPowerCrossfade(
        prev.gain,
        gain,
        startTime,
        this.crossfadeSeconds,
        /* peakOut */ 1,
        /* peakIn */ 1
      );
    }

    // Schedule fade-out at the end of THIS iteration's loop offset.
    // (The next iteration's gain ramp will be scheduled when that iteration
    // is created, so we only need to know that the next one starts at
    // startTime + loopOffset - crossfade. The fade-out is handled by the
    // next iteration's call to scheduleEqualPowerCrossfade.)
    // We DO need to schedule the source.stop() so this buffer doesn't keep
    // playing forever:
    const sourceEndTime = startTime + variant.loopOffsetSeconds + this.crossfadeSeconds;
    source.stop(sourceEndTime + 0.05);

    const live: LiveSource = {
      source,
      gain,
      startedAt: startTime,
      loopOffset: variant.loopOffsetSeconds,
    };
    this.liveSources.push(live);

    // Clean up live source once it's finished.
    source.onended = () => {
      try {
        gain.disconnect();
      } catch {
        /* noop */
      }
      const idx = this.liveSources.indexOf(live);
      if (idx >= 0) this.liveSources.splice(idx, 1);
    };

    // Schedule the next iteration to start (loopOffset - crossfade) seconds
    // from now. We use setTimeout to fire slightly *before* it's due so we
    // can call source.start() with a precise AudioContext time. Browsers
    // can deliver setTimeout late, so we schedule the audio a small lookahead
    // ahead of "now" — an absolute AudioContext time means the timer firing
    // late doesn't cause a glitch.
    if (this.playing) {
      const nextIterationTime = startTime + variant.loopOffsetSeconds - this.crossfadeSeconds;
      const timerDelayMs = (nextIterationTime - this.ctx.currentTime) * 1000 - 1500;
      // Lookahead: 1500ms before the intended audio start, we run the
      // scheduling code. If timerDelayMs ≤ 0 we just fire ASAP.
      this.nextScheduleTimer = setTimeout(() => {
        if (this.playing) this.scheduleIteration(nextIterationTime, false);
      }, Math.max(0, timerDelayMs));
    }
  }

  private pickNextVariant(): AudioVariant {
    if (this.variants.length === 1) {
      this.lastVariantIndex = 0;
      return this.variants[0]!;
    }
    let idx: number;
    if (this.variantRotation === 'sequential') {
      idx = this.nextVariantIndex % this.variants.length;
      this.nextVariantIndex = (this.nextVariantIndex + 1) % this.variants.length;
    } else {
      // Random but never repeat the immediately previous variant.
      do {
        idx = Math.floor(Math.random() * this.variants.length);
      } while (idx === this.lastVariantIndex && this.variants.length > 1);
    }
    this.lastVariantIndex = idx;
    return this.variants[idx]!;
  }

  async stop(): Promise<void> {
    if (!this.playing) return;
    const fade = this.scheduleFadeOut();
    await wait((fade + 0.1) * 1000);
    this.liveSources.length = 0;
  }

  /**
   * Schedule a fade-out and queue disposal in a fire-and-forget tail.
   * Returns immediately so the caller can run a parallel fade-in on
   * another layer (the cross-scene case from §3.5 of the brief).
   */
  fadeAndDispose(durationSeconds: number): void {
    if (!this.playing) {
      this.dispose();
      return;
    }
    const fade = this.scheduleFadeOut(durationSeconds);
    // Tail teardown — runs after the fade has completed. AudioParam
    // ramps already locked everything to the AudioContext clock, so a
    // late timer can't introduce a glitch.
    setTimeout(() => {
      this.dispose();
    }, (fade + 0.1) * 1000);
  }

  /**
   * Internal: cancel the schedule timer, mark the layer not-playing,
   * and ramp every live source to 0 over `durationSeconds` (defaults
   * to crossfadeSeconds). Schedules each source.stop just past the
   * fade end. Returns the fade duration actually used.
   */
  private scheduleFadeOut(durationSeconds?: number): number {
    this.playing = false;
    if (this.nextScheduleTimer) {
      clearTimeout(this.nextScheduleTimer);
      this.nextScheduleTimer = null;
    }
    const fade = Math.max(0.05, durationSeconds ?? this.crossfadeSeconds);
    const now = this.ctx.currentTime;
    for (const live of this.liveSources) {
      live.gain.gain.cancelScheduledValues(now);
      live.gain.gain.setValueAtTime(live.gain.gain.value, now);
      live.gain.gain.linearRampToValueAtTime(0, now + fade);
      try {
        live.source.stop(now + fade + 0.05);
      } catch {
        /* already stopped */
      }
    }
    return fade;
  }

  setVolume(value: number): void {
    this.currentVolume = Math.max(0, Math.min(1, value));
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
    if (this.nextScheduleTimer) {
      clearTimeout(this.nextScheduleTimer);
      this.nextScheduleTimer = null;
    }
    for (const live of this.liveSources) {
      try {
        live.source.stop();
      } catch {
        /* noop */
      }
      try {
        live.gain.disconnect();
      } catch {
        /* noop */
      }
    }
    this.liveSources.length = 0;
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

// ---------------------------------------------------------------------------
// Helpers for loading audio buffers — kept here so callers don't need to
// re-implement the same fetch+decodeAudioData dance everywhere.

/** Fetch and decode an audio file into an AudioBuffer. */
export async function loadAudioBuffer(
  ctx: AudioContext,
  url: string
): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
}
