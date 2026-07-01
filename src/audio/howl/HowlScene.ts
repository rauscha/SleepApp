// HowlScene — Path A: play a scene's ambient layers through real HTML5
// <audio> elements (via Howler with html5:true), one looping element per
// layer, instead of scheduling buffers on the Web Audio graph.
//
// Why this exists (2026-06-15 architecture pivot):
//   The Web Audio bed path survived overnight only by routing the master
//   bus into an <audio> element through a MediaStreamAudioDestinationNode.
//   That srcObject = MediaStream pattern is explicitly unsupported (W3C
//   Web Audio issue #2293): on Chromium the element's currentTime never
//   advances, so the OS doesn't treat it as live media and the audio dies
//   in the background — the silent-stall we chased for days. The apps that
//   play all night (Spotify, Calm, YouTube) all play a real media element
//   and let the OS own the playback loop. Howler's html5 mode is exactly
//   that primitive, and it already powers the narration player here.
//
// Each layer loops its own MP3 natively (different file lengths → the
// combined soundscape still doesn't resync for a long time, the Eno
// "incommensurate loops" effect, now done by the OS rather than a chain
// timer). No AudioContext, no keep-alive, no zombie watchdog, no
// MediaStream bridge — the whole fragile stack is gone from the bed.

import { Howl } from 'howler';
import { recordEvent } from '../../diagnostics/lifecycleLog';
import { resolvePublicUrl } from '../../lib/baseUrl';
import type {
  SceneDefinition,
  SceneElementDefinition,
  SceneVariantDefinition,
} from '../sceneFormat';

/** Quick (non-audible-jump) ramp for slider / cancel-fade restores. */
const QUICK_RAMP_SECONDS = 0.4;
/** Slack after a fade-out before the element is actually stopped + freed. */
const DISPOSE_BUFFER_MS = 300;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function short(err: unknown): string {
  return String(err instanceof Error ? err.message : err).slice(0, 80);
}

/**
 * The slice of Howler's API this module uses. Declared so tests can inject
 * a fake without a real AudioContext / DOM media element.
 */
export interface HowlLike {
  play(): number;
  pause(): void;
  stop(): unknown;
  unload(): void;
  fade(from: number, to: number, durationMs: number): unknown;
  /** Getter (no arg) returns current group volume; setter applies it. */
  volume(level?: number): number;
  playing(): boolean;
}

export interface HowlFactoryOptions {
  src: string[];
  onplay?: () => void;
  onplayerror?: (id: number, err: unknown) => void;
  onloaderror?: (id: number, err: unknown) => void;
}

export type HowlFactory = (opts: HowlFactoryOptions) => HowlLike;

/** Default factory — a real looping html5 Howl. */
export const defaultHowlFactory: HowlFactory = (opts) =>
  new Howl({
    src: opts.src,
    // Scene audio ships as Opus (2026-06-30 — see DECISIONS.md "Ship scene
    // audio as Opus, not MP3": MP3's ~16kHz lowpass strips noise "air" that
    // matters for this material). mp3/wav stay in the format list during the
    // migration — not every scene is re-cut to Opus yet — and as a generic
    // safety net for any wav source.
    format: ['opus', 'mp3', 'wav'],
    html5: true, // the whole point — OS-backed background playback
    loop: true,
    volume: 0, // start silent; the layer fades in on play
    onplay: opts.onplay,
    onplayerror: opts.onplayerror,
    onloaderror: opts.onloaderror,
  }) as unknown as HowlLike;

/** Pick a variant at random so repeat plays of a scene aren't identical. */
function randomVariant(el: SceneElementDefinition): SceneVariantDefinition {
  const i = Math.floor(Math.random() * el.variants.length);
  return el.variants[i] ?? el.variants[0]!;
}

// ---------------------------------------------------------------------------
// HowlLayer — one looping element, exposing the Layer surface PlayerScreen's
// mixer reads (id / label / getVolume / setVolume).

export class HowlLayer {
  readonly id: string;
  readonly label: string;
  private readonly howl: HowlLike;
  /** This layer's mix level in [0,1] (the value the mixer slider shows). */
  private target: number;
  /** Outer multiplier = scene master × scene gain (deep-night reduction). */
  private outer: number;
  private fadeInMs = 0;
  private started = false;
  private disposed = false;
  /** Whether the from-silence fade-in has already run once. */
  private hasFadedIn = false;

  constructor(
    id: string,
    label: string,
    src: string[],
    target: number,
    outer: number,
    factory: HowlFactory
  ) {
    this.id = id;
    this.label = label;
    this.target = clamp01(target);
    this.outer = clamp01(outer);
    this.howl = factory({
      src,
      onplay: () => {
        if (this.disposed) return;
        if (this.hasFadedIn) {
          // A native html5 <audio> element can re-fire 'play' after this
          // layer's first start — e.g. the browser resuming it after an
          // OS-level audio-focus interruption, or Howler reassigning it
          // from its pooled-element cache. Re-running the from-zero fade
          // here would silently drop the layer to silence and swell it
          // back up over fadeInMs — audible under narration as a sudden
          // "background got loud" moment. Only the true first play fades
          // in; any later replay just re-asserts the current target so the
          // layer stays exactly where the mixer/attenuation left it.
          this.howl.volume(this.effective());
          return;
        }
        // Apply the fade-in only once playback actually starts: an html5
        // element may defer play() until it can play, and a fade issued
        // before then is a no-op (Howler only animates playing sounds).
        this.hasFadedIn = true;
        this.howl.fade(0, this.effective(), this.fadeInMs);
      },
      onplayerror: (_id, err) =>
        recordEvent('howl-bed-playerror', `${this.id}: ${short(err)}`),
      onloaderror: (_id, err) =>
        recordEvent('howl-bed-loaderror', `${this.id}: ${short(err)}`),
    });
  }

  private effective(): number {
    return clamp01(this.target * this.outer);
  }

  private currentVolume(): number {
    try {
      return this.howl.volume();
    } catch {
      return this.effective();
    }
  }

  /** Begin playback, fading in from silence over `fadeInSeconds`. */
  start(fadeInSeconds: number): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.fadeInMs = Math.max(0, Math.round(fadeInSeconds * 1000));
    this.howl.play();
  }

  getVolume(): number {
    return this.target;
  }

  /** Mixer slider — set this layer's mix level. */
  setVolume(v: number): void {
    this.target = clamp01(v);
    if (this.started && !this.disposed) this.howl.volume(this.effective());
  }

  /** Master / scene-gain change — re-apply the outer multiplier. */
  setOuter(outer: number): void {
    this.outer = clamp01(outer);
    if (this.started && !this.disposed) this.howl.volume(this.effective());
  }

  /** Fade to silence over `seconds` (sleep-timer fire / crossfade-out). */
  fadeToSilence(seconds: number): void {
    if (!this.started || this.disposed) return;
    this.howl.fade(this.currentVolume(), 0, Math.max(0, Math.round(seconds * 1000)));
  }

  /** Restore to the mix level after a cancelled fade. */
  restore(): void {
    if (!this.started || this.disposed) return;
    this.howl.fade(
      this.currentVolume(),
      this.effective(),
      Math.round(QUICK_RAMP_SECONDS * 1000)
    );
  }

  pause(): void {
    if (this.started && !this.disposed) this.howl.pause();
  }

  resume(): void {
    if (this.started && !this.disposed) this.howl.play();
  }

  /** Fade out, then free the element. */
  fadeAndDispose(seconds: number): void {
    if (this.disposed) return;
    const ms = Math.max(0, Math.round(seconds * 1000));
    if (this.started) this.howl.fade(this.currentVolume(), 0, ms);
    setTimeout(() => this.dispose(), ms + DISPOSE_BUFFER_MS);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.howl.stop();
    } catch {
      /* already gone */
    }
    try {
      this.howl.unload();
    } catch {
      /* already gone */
    }
  }
}

// ---------------------------------------------------------------------------
// HowlScene — a whole scene as a stack of looping HowlLayers. Structurally
// compatible with what PlayerScreen reads off a Web Audio Scene
// (id / definition / getLayers / setLayerVolume / isDisposed).

export class HowlScene {
  readonly id: string;
  readonly definition: SceneDefinition;
  private readonly layers: HowlLayer[];
  /** User master volume in [0,1]. */
  private master: number;
  /** Persistent scene-gain multiplier (deep-night resume comes in quieter). */
  private sceneGain = 1;
  private disposed = false;

  constructor(
    definition: SceneDefinition,
    master: number,
    factory: HowlFactory = defaultHowlFactory,
    pickVariant: (el: SceneElementDefinition) => SceneVariantDefinition = randomVariant
  ) {
    this.id = definition.id;
    this.definition = definition;
    this.master = clamp01(master);
    const layers: HowlLayer[] = [];
    // Synth-bed carrier (the brief's spectral glue): a quiet, seamless,
    // pre-rendered noise loop per color, 887s (prime, coprime to the element
    // offsets so it never resyncs with them). It rides underneath like the
    // old Web-Audio NoiseGenerator bed, just played natively so it survives
    // the night with everything else.
    if (definition.synth) {
      layers.push(
        new HowlLayer(
          `${definition.id}:synth-bed`,
          'Synth bed',
          [resolvePublicUrl(`/audio/_bed/${definition.synth.color}.opus`)],
          definition.synth.defaultVolume,
          this.master,
          factory
        )
      );
    }
    for (const el of definition.elements) {
      const variant = pickVariant(el);
      layers.push(
        new HowlLayer(
          `${definition.id}:${el.id}`,
          el.label,
          [resolvePublicUrl(variant.url)],
          el.defaultVolume,
          this.master,
          factory
        )
      );
    }
    this.layers = layers;
  }

  private outer(): number {
    return clamp01(this.master * this.sceneGain);
  }

  getLayers(): HowlLayer[] {
    return this.layers;
  }

  setLayerVolume(id: string, v: number): void {
    const layer = this.layers.find((l) => l.id === id);
    if (layer) layer.setVolume(v);
  }

  setMaster(master: number): void {
    this.master = clamp01(master);
    const o = this.outer();
    for (const l of this.layers) l.setOuter(o);
  }

  /**
   * Start every layer, fading in over `fadeInSeconds`. `sceneGain` is the
   * persistent gain target (1.0 normally; 0.6 for a deep-night resume so
   * the room seeps back in quietly and stays there — master changes don't
   * undo it).
   */
  start(fadeInSeconds: number, sceneGain = 1): void {
    if (this.disposed) return;
    this.sceneGain = clamp01(sceneGain);
    const o = this.outer();
    for (const l of this.layers) {
      l.setOuter(o);
      l.start(fadeInSeconds);
    }
  }

  fadeToSilence(seconds: number): void {
    for (const l of this.layers) l.fadeToSilence(seconds);
  }

  restore(master: number): void {
    this.setMaster(master);
    for (const l of this.layers) l.restore();
  }

  pause(): void {
    for (const l of this.layers) l.pause();
  }

  resume(): void {
    for (const l of this.layers) l.resume();
  }

  fadeAndDispose(seconds: number): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const l of this.layers) l.fadeAndDispose(seconds);
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const l of this.layers) l.dispose();
  }
}
