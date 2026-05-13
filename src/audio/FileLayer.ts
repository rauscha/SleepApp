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
// iteration's gain node.
//
// Pipeline depth (LOOKAHEAD_COUNT). start() pre-fills three iterations
// at exact AudioContext times. Audio scheduled via source.start(t) is
// locked to the audio clock, so even if iOS Safari throttles the main-
// thread setTimeout to ~1Hz when the page backgrounds (or freezes JS
// entirely for tens of seconds under the page-lifecycle frozen state),
// the next two iterations after the head play seamlessly without needing
// the main thread at all. The chain timer becomes a once-per-iteration
// "top up the tail by one" trigger with ~(LOOKAHEAD_COUNT - 1) iteration
// periods of slack before the pipeline drains.

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
  /**
   * How many iterations to keep scheduled ahead at any moment. Three
   * iterations means the audio survives ~2 full iteration periods of
   * timer throttling — comfortably more than iOS Safari's ~30s worst
   * case for backgrounded tabs.
   */
  private static readonly LOOKAHEAD_COUNT = 3;

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
  /**
   * The most recently scheduled iteration's start time and loop offset —
   * everything the chain timer needs to compute the next iteration's
   * start time without consulting liveSources (which may have already
   * removed the relevant entry via source.onended).
   */
  private pipelineTail: { startTime: number; loopOffset: number } | null =
    null;
  /**
   * The startedAt of the most recent iteration the chain timer has
   * already fired on. Used so armChainTimer picks the NEXT upcoming
   * iteration as its target, never re-firing on one already handled.
   */
  private lastHandledStartTime = -Infinity;

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
    this.lastHandledStartTime = -Infinity;
    // Pre-fill the pipeline. Each iteration past the first is scheduled
    // at a future AudioContext time and locked to the audio clock at
    // source.start(t) — the main thread plays no further role for those
    // iterations. This is the slack that absorbs setTimeout throttling.
    let nextStart = this.ctx.currentTime;
    for (let i = 0; i < FileLayer.LOOKAHEAD_COUNT; i++) {
      const variant = this.scheduleSingleIteration(
        nextStart,
        /* isFirst */ i === 0
      );
      nextStart =
        nextStart + variant.loopOffsetSeconds - this.crossfadeSeconds;
    }
    this.armChainTimer();
  }

  /**
   * Schedule exactly ONE playback iteration starting at `startTime`. Pure
   * scheduling — caller is responsible for chaining. Returns the variant
   * used (so the caller can compute the next iteration's start time from
   * its loop offset).
   */
  private scheduleSingleIteration(
    startTime: number,
    isFirst: boolean
  ): AudioVariant {
    const variant = this.pickNextVariant();
    const source = this.ctx.createBufferSource();
    source.buffer = variant.buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.output);

    // Schedule playback start exactly at startTime.
    source.start(startTime);

    // Schedule fade-in (and fade-out for the previous iteration if any).
    // "Previous" is the iteration most recently pushed to liveSources,
    // i.e. the one we are crossfading IN over. With pre-fill at start(),
    // that's the iteration scheduled in the loop iteration just before
    // this one.
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

    // Schedule source.stop() so this buffer doesn't keep playing past the
    // end of its loop offset + crossfade tail. The next iteration's own
    // crossfade handles the gain ramp down.
    const sourceEndTime =
      startTime + variant.loopOffsetSeconds + this.crossfadeSeconds;
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

    this.pipelineTail = {
      startTime,
      loopOffset: variant.loopOffsetSeconds,
    };
    return variant;
  }

  /**
   * Arm a one-shot timer that fires ~100ms after the next not-yet-handled
   * iteration starts. When it fires, we extend the pipeline tail by one
   * iteration and re-arm. The chain timer is the only thing that needs
   * the main thread to keep audio going past the pre-filled iterations —
   * but because the pipeline is LOOKAHEAD_COUNT deep, it has wide latitude
   * to fire late without causing a loop seam.
   */
  private armChainTimer(): void {
    if (!this.playing) return;
    // Pick the next upcoming iteration we haven't already fired the
    // chain timer on. Tracking lastHandledStartTime explicitly (rather
    // than relying on a time-window heuristic against the audio clock)
    // avoids re-firing on the same iteration multiple times in tight
    // succession — which would otherwise extend the pipeline unbounded.
    const target = this.liveSources.find(
      (l) => l.startedAt > this.lastHandledStartTime
    );
    if (!target) return;
    const now = this.ctx.currentTime;
    const timerDelayMs = Math.max(0, (target.startedAt - now) * 1000) + 100;
    this.nextScheduleTimer = setTimeout(() => {
      this.nextScheduleTimer = null;
      if (!this.playing || !this.pipelineTail) return;
      this.lastHandledStartTime = target.startedAt;
      const nextStart =
        this.pipelineTail.startTime +
        this.pipelineTail.loopOffset -
        this.crossfadeSeconds;
      // If we've fallen so far behind that nextStart is already in the
      // past, source.start(past_time) starts immediately with no crossfade
      // — an audible seam. That's the pipeline-drained failure mode the
      // lookahead exists to prevent, so getting here means the timer was
      // delayed for >~(LOOKAHEAD_COUNT - 1) iteration periods. We still
      // recover by starting "just-now" rather than throwing.
      const safeStart = Math.max(nextStart, this.ctx.currentTime + 0.01);
      this.scheduleSingleIteration(safeStart, /* isFirst */ false);
      this.armChainTimer();
    }, timerDelayMs);
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
    // The pipeline is done; null this out so any latent timer that fires
    // before the cancelled handler runs (race window is theoretical, not
    // observed) doesn't try to chain onto stale state.
    this.pipelineTail = null;
    const fade = Math.max(0.05, durationSeconds ?? this.crossfadeSeconds);
    const now = this.ctx.currentTime;
    // Ramp the LAYER's master output to 0 over `fade`. We deliberately do
    // NOT touch the per-iteration gain nodes: they may be inside an active
    // setValueCurveAtTime window (from scheduleEqualPowerCrossfade), and
    // scheduling new events during that window can throw InvalidStateError
    // on some Web Audio implementations. Ramping the downstream master is
    // mathematically equivalent (signal still fades to silence) and avoids
    // any cancel/curve conflict. The parameterized `fade` lets the cross-
    // scene 8-second fade in §3.5 use this same path.
    const current = this.output.gain.value;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(current, now);
    this.output.gain.linearRampToValueAtTime(0, now + fade);
    for (const live of this.liveSources) {
      try {
        live.source.stop(now + fade + 0.05);
      } catch {
        /* already stopped */
      }
    }
    return fade;
  }

  setVolume(value: number): void {
    // Ignore volume changes after stop() — we are fading the master output
    // to 0 and a slider drag mid-fade should not fight the fade.
    if (!this.playing) {
      this.currentVolume = Math.max(0, Math.min(1, value));
      return;
    }
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
    this.pipelineTail = null;
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
