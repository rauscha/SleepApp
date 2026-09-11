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

/** Length of the pre-rendered synth-bed carrier loops in
 *  `public/audio/_bed/*.opus` — 887s, the 5th prime, coprime to every
 *  element offset so the bed never resyncs with them. */
export const SYNTH_BED_LOOP_SECONDS = 887;

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
  /**
   * Playback position in seconds. Optional because it is only used for
   * diagnostics (the debug markers): Howler returns the element's own
   * `currentTime`, which is the only trustworthy answer for "where in its
   * loop is this layer right now" — elapsed-time arithmetic drifts across a
   * night of OS pauses and Howler's loop restarts.
   */
  seek?(): number;
}

export interface HowlFactoryOptions {
  src: string[];
  onplay?: () => void;
  onplayerror?: (id: number, err: unknown) => void;
  onloaderror?: (id: number, err: unknown) => void;
}

export type HowlFactory = (opts: HowlFactoryOptions) => HowlLike;

/**
 * The `format` array Howler should use for a set of srcs. Howler pairs
 * format[i] with src[i] (howler.js `_load`) — it is POSITIONAL, NOT a
 * fallback chain. Passing a fixed `['opus','mp3','wav']` with a single src
 * therefore tells Howler that src is *opus*, so every layer — including the
 * `.mp3` ones — gets gated on `canPlayType('audio/ogg; codecs="opus"')`.
 * Chromium/Firefox pass, but Safari/iOS returns "" and the scene starts
 * silent. Deriving the format from each src's own extension is what makes an
 * .mp3 layer play as mp3. A query/hash is stripped first so a cache-busted or
 * CDN URL still resolves its real extension.
 */
export function howlFormats(src: string[]): string[] {
  return src.map((s) => s.split(/[?#]/)[0]!.split('.').pop()!.toLowerCase());
}

/** The shape of the private Howler internals the native-loop fix reaches
 *  into. Declared rather than casting inline so the reach is visible. */
interface HowlInternals {
  _sounds?: Array<{ _node?: { loop?: boolean } }>;
  loop(on: boolean): unknown;
}

/**
 * Turn the *element's own* looping on or off for every sound in a Howl.
 *
 * Why this exists (measured 2026-09-11, headless Chromium 151 — see
 * DECISIONS.md): `new Howl({ html5: true, loop: true })` never sets the
 * `<audio>` element's native `loop`. Howler runs the loop itself, from a JS
 * timer: when the element ends it calls `stop().play()`, which rewinds and
 * restarts it. Measured against a 2s Opus loop that costs **27 ms of silence
 * at every wrap** (max 37 ms), against 3.8 ms for a bare `<audio loop>`. On
 * a noise bed that is an audible tick, every 199-887 seconds, all night —
 * and it happens *after* the gapless wrap `tools/loopify-scenes.py` bakes
 * into the file, so the crossfade can do nothing about it.
 *
 * Handing the loop to the element brings it back to the bare-element figure
 * (3.6 ms) and stops Howler intervening at all: no 'end' events, no replay
 * 'play' events, `playing()` stays true, `fade()` still works.
 *
 * Returns false if the elements could not be reached, so the caller can fall
 * back rather than leave a layer that stops after one period.
 */
export function applyNativeLoop(howl: HowlInternals, on: boolean): boolean {
  const sounds = howl._sounds;
  if (!Array.isArray(sounds) || sounds.length === 0) return false;
  let touched = false;
  for (const sound of sounds) {
    const node = sound?._node;
    // Every sound, not just the first: any element we leave looping goes
    // back into Howler's shared pool still looping. _releaseHtml5Audio()
    // pushes it back untouched and Sound.create() never resets `loop`, so
    // the next consumer inherits it — and the next consumer might be a
    // story's narration, which would then repeat until morning.
    if (node && typeof node === 'object' && 'loop' in node) {
      node.loop = on;
      touched = true;
    }
  }
  return touched;
}

/** Default factory — one html5 element per layer, looping natively. */
export const defaultHowlFactory: HowlFactory = (opts) => {
  const howl = new Howl({
    src: opts.src,
    // Scene audio is migrating to Opus (2026-06-30 — see DECISIONS.md "Ship
    // scene audio as Opus, not MP3"); mp3 and opus both still ship. The
    // format MUST be derived per-src (see howlFormats) — a fixed list is
    // positional, not a fallback, and would opus-gate the .mp3 layers.
    format: howlFormats(opts.src),
    html5: true, // the whole point — OS-backed background playback
    // NOT Howler's loop: it restarts the element from a JS timer and costs
    // ~27ms of silence at every wrap. The element loops itself instead —
    // see applyNativeLoop. With loop:false Howler waits on an 'ended' event
    // that a natively looping element never fires, so it never intervenes.
    loop: false,
    volume: 0, // start silent; the layer fades in on play
    onplay: () => {
      if (!applyNativeLoop(howl as unknown as HowlInternals, true)) {
        // Couldn't reach the element — a future Howler could rename its
        // internals. Fall back to Howler's own timer-driven loop, which is
        // what shipped before this change: a tick at each wrap is bad, a
        // layer that stops dead after one period is far worse. Howler picks
        // the loop up on the next 'ended'.
        try {
          (howl as unknown as HowlInternals).loop(true);
          recordEvent('howl-native-loop-unavailable', opts.src[0] ?? '?');
        } catch {
          /* nothing more we can do; the layer will run once */
        }
      }
      opts.onplay?.();
    },
    onplayerror: opts.onplayerror,
    onloaderror: opts.onloaderror,
  });

  const api = howl as unknown as HowlLike;
  return {
    play: () => api.play(),
    pause: () => api.pause(),
    stop: () => api.stop(),
    unload: () => {
      // Hand the element back to the pool exactly as Howler expects to find
      // it. See applyNativeLoop for what a stray `loop` would do to the next
      // sound that borrows this element.
      applyNativeLoop(howl as unknown as HowlInternals, false);
      api.unload();
    },
    fade: (from, to, ms) => api.fade(from, to, ms),
    volume: (level?: number) => {
      if (level === undefined) return api.volume();
      api.volume(level);
      return level;
    },
    playing: () => api.playing(),
    seek: () => {
      const value = (howl as unknown as { seek(): number | unknown }).seek();
      return typeof value === 'number' ? value : 0;
    },
  };
};

/** Pick a variant at random so repeat plays of a scene aren't identical. */
function randomVariant(el: SceneElementDefinition): SceneVariantDefinition {
  const i = Math.floor(Math.random() * el.variants.length);
  return el.variants[i] ?? el.variants[0]!;
}

// ---------------------------------------------------------------------------
// HowlLayer — one looping element, exposing the Layer surface PlayerScreen's
// mixer reads (id / label / getVolume / setVolume).

/** One layer's state at an instant — what a debug marker records. */
export interface HowlLayerSnapshot {
  id: string;
  label: string;
  /** The variant file this layer actually picked for tonight. */
  url: string;
  /** The layer's loop length in seconds (its element's prime offset; 887
   *  for the synth-bed carrier). */
  periodSeconds: number;
  /** Live playback position in seconds, or null if the element can't be
   *  read (not started, disposed, or a Howl without seek support). */
  seekSeconds: number | null;
  /** Mixer level for this layer, in [0,1]. */
  volume: number;
  /** Outer multiplier applied on top (master x scene gain). */
  outer: number;
  /** Whether the element reports itself as playing. */
  playing: boolean;
}

export class HowlLayer {
  readonly id: string;
  readonly label: string;
  /** Source url of the picked variant — recorded so a marker names the
   *  exact file that was in the user's ears. */
  readonly url: string;
  /** This layer's loop length in seconds. */
  readonly periodSeconds: number;
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
  /**
   * Wall-clock ms at which an in-flight fade-to-silence (sleep timer or
   * crossfade-out) is scheduled to reach 0; 0 means no such fade is active.
   * While it is set, a spurious element replay or an outer-gain change must
   * NOT snap the layer back up via volume() — that call cancels Howler's
   * running fade (_stopFade), which is exactly the "full-volume snap then
   * hard cut" the sleep timer must never produce.
   */
  private silenceFadeEndsAt = 0;

  constructor(
    id: string,
    label: string,
    src: string[],
    target: number,
    outer: number,
    factory: HowlFactory,
    periodSeconds = 0
  ) {
    this.id = id;
    this.label = label;
    this.url = src[0] ?? '';
    this.periodSeconds = periodSeconds;
    this.target = clamp01(target);
    this.outer = clamp01(outer);
    this.howl = factory({
      src,
      onplay: () => {
        if (this.disposed) return;
        if (this.hasFadedIn) {
          // A native html5 <audio> element can re-fire 'play' after this
          // layer's first start — e.g. the browser resuming it after an
          // OS-level audio-focus interruption, a lock-screen resume via the
          // media-session play handler, or Howler reassigning it from its
          // pooled-element cache. Re-running the from-zero fade here would
          // drop the layer to silence and swell it back up over fadeInMs —
          // audible under narration as a sudden "background got loud" moment.
          if (this.silenceFadeEndsAt > 0) {
            // A sleep-timer / crossfade fade-to-silence is in flight. The
            // user's intent (fall asleep) outranks the OS replay event, so
            // keep heading to silence over the REMAINING wall-clock time
            // rather than re-asserting full mix via volume() — which would
            // cancel the fade and snap the layer loud, then hard-cut when the
            // timer's stop lands. A paused element's own clock stopped, so
            // recompute the remaining time from wall time; this errs toward
            // finishing on the user's schedule.
            const remaining = this.silenceFadeEndsAt - Date.now();
            if (remaining > 0) this.howl.fade(this.currentVolume(), 0, remaining);
            else this.howl.volume(0);
            return;
          }
          // Normal replay: just re-assert the current target so the layer
          // stays exactly where the mixer/attenuation left it.
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

  /**
   * Read the element's live playback position. Never inferred from wall
   * time: an OS audio-focus pause, a lock-screen pause, or Howler's own
   * loop restart all move the element's clock independently of ours, and
   * the whole point of a marker is to say exactly where in this file the
   * user heard something.
   */
  getSeekSeconds(): number | null {
    if (!this.started || this.disposed) return null;
    try {
      const raw = this.howl.seek?.();
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    } catch {
      return null;
    }
  }

  snapshot(): HowlLayerSnapshot {
    let playing = false;
    try {
      playing = this.howl.playing();
    } catch {
      playing = false;
    }
    return {
      id: this.id,
      label: this.label,
      url: this.url,
      periodSeconds: this.periodSeconds,
      seekSeconds: this.getSeekSeconds(),
      volume: this.target,
      outer: this.outer,
      playing,
    };
  }

  /** Mixer slider — set this layer's mix level. */
  setVolume(v: number): void {
    // An explicit mixer action is a deliberate user choice: it supersedes any
    // in-flight fade-to-silence, so clear the guard before applying.
    this.silenceFadeEndsAt = 0;
    this.target = clamp01(v);
    if (this.started && !this.disposed) this.howl.volume(this.effective());
  }

  /** Master / scene-gain change — re-apply the outer multiplier. */
  setOuter(outer: number): void {
    this.outer = clamp01(outer);
    // Record the new multiplier so a later restore() recomputes effective()
    // from it, but do NOT apply it live while a fade-to-silence is running —
    // volume() would cancel that fade (e.g. a Night Drift gain change firing
    // mid sleep-timer fade would otherwise snap the bed back up).
    if (this.started && !this.disposed && this.silenceFadeEndsAt === 0) {
      this.howl.volume(this.effective());
    }
  }

  /** Fade to silence over `seconds` (sleep-timer fire / crossfade-out). */
  fadeToSilence(seconds: number): void {
    if (!this.started || this.disposed) return;
    const ms = Math.max(0, Math.round(seconds * 1000));
    this.silenceFadeEndsAt = Date.now() + ms;
    this.howl.fade(this.currentVolume(), 0, ms);
  }

  /** Restore to the mix level after a cancelled fade. */
  restore(): void {
    if (!this.started || this.disposed) return;
    // The user cancelled the sleep timer / is staying awake: the fade is off.
    this.silenceFadeEndsAt = 0;
    this.howl.fade(
      this.currentVolume(),
      this.effective(),
      Math.round(QUICK_RAMP_SECONDS * 1000)
    );
  }

  pause(): void {
    if (this.started && !this.disposed) this.howl.pause();
  }

  /**
   * Resume a paused layer. Guarded on `playing()` because Howler's `play()`
   * with no sound id does NOT mean "resume this element": `_inactiveSound()`
   * only reuses a sound that has ended or is paused, and when every sound is
   * already playing it CREATES A NEW ONE. On the html5 path that takes a
   * second element out of Howler's pool of ten and plays a second copy of
   * the same loop at a random offset against the first — a layer roughly
   * +6 dB and phasing, for the rest of the night, with nothing tracking the
   * extra element to stop it. The OS fires `play` on an already-playing
   * session freely (lock-screen tap, headset button, audio-focus return),
   * so this is reachable without any bug elsewhere.
   */
  resume(): void {
    if (!this.started || this.disposed) return;
    if (this.howl.playing()) return;
    this.howl.play();
  }

  /** Fade out, then free the element. */
  fadeAndDispose(seconds: number): void {
    if (this.disposed) return;
    const ms = Math.max(0, Math.round(seconds * 1000));
    if (this.started) {
      // Same guard as fadeToSilence: a replay during this fade-out must keep
      // heading to silence, not snap back up a layer that is being disposed.
      this.silenceFadeEndsAt = Date.now() + ms;
      this.howl.fade(this.currentVolume(), 0, ms);
    }
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

  /**
   * @param volumeOverrides Saved Mixer levels keyed by layer id. Applied as
   *   each layer's *initial* target rather than set afterwards: a post-start
   *   setVolume() would call howl.volume(), and Howler treats that as a
   *   cancel of the running fade (_stopFade), so the scene would snap to
   *   full level instead of fading in from silence.
   */
  constructor(
    definition: SceneDefinition,
    master: number,
    factory: HowlFactory = defaultHowlFactory,
    pickVariant: (el: SceneElementDefinition) => SceneVariantDefinition = randomVariant,
    volumeOverrides: Readonly<Record<string, number>> = {}
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
    const mix = (layerId: string, fallback: number): number => {
      const saved = volumeOverrides[layerId];
      return typeof saved === 'number' && Number.isFinite(saved)
        ? clamp01(saved)
        : fallback;
    };
    if (definition.synth) {
      const id = `${definition.id}:synth-bed`;
      layers.push(
        new HowlLayer(
          id,
          'Synth bed',
          [resolvePublicUrl(`/audio/_bed/${definition.synth.color}.opus`)],
          mix(id, definition.synth.defaultVolume),
          this.master,
          factory,
          SYNTH_BED_LOOP_SECONDS
        )
      );
    }
    for (const el of definition.elements) {
      const variant = pickVariant(el);
      const id = `${definition.id}:${el.id}`;
      layers.push(
        new HowlLayer(
          id,
          el.label,
          [resolvePublicUrl(variant.url)],
          mix(id, el.defaultVolume),
          this.master,
          factory,
          el.loopOffsetSeconds
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

  /** Every layer's live state — what a debug marker records. */
  snapshot(): HowlLayerSnapshot[] {
    return this.layers.map((l) => l.snapshot());
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
