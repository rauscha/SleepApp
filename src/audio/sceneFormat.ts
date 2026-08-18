// Scene format — JSON-serializable schema for House Blends and curated mixes.
//
// This file is the data shape for Phase 2. The audio engine (Phase 1) does
// not consume it directly yet, but defining it now means:
//   1. Phase 2 starts with a settled schema.
//   2. We can author Forest, Rain on Window, etc. as JSON files and check
//      them into the repo while still at Phase 1.
//   3. Variant prime-adjacent loop offsets from §3.1.3 of the brief have
//      a defined home (per-layer `loopOffsetSeconds`).
//
// A SceneDefinition is a pure data structure — no AudioBuffers — so it can
// be JSON-encoded, fetched, edited, even round-tripped through a future
// "share scene" flow without dragging audio bytes around.

import type { NoiseColor } from './types';

export interface SceneDefinition {
  /** Unique scene id, e.g. 'forest-day'. */
  id: string;
  /** Human-readable label, e.g. 'Forest, midday'. */
  label: string;
  /** Optional short description shown on the scene card. */
  description?: string;

  /** Synthesized noise bed. */
  synth: {
    color: NoiseColor;
    /** Default volume in [0, 1]. */
    defaultVolume: number;
  };

  /** Tinnitus masking layer config. */
  tinnitus?: {
    /** Whether the scene includes the masking layer. User can still toggle. */
    enabledByDefault: boolean;
    defaultVolume: number;
  };

  /** Ambient element layers. 3–5 per the brief; we do not enforce a count. */
  elements: SceneElementDefinition[];

  /**
   * Optional Night Drift target (roadmap 6.2): after `afterMinutes` of this
   * scene playing, the session crossfades — over a very long
   * `crossfadeSeconds` — into the scene with id `sceneId`, so the night
   * composes itself (forest-evening → forest-night) rather than holding one
   * static loop. The drift is scheduled at the session level and cancelled
   * by any scene stop/switch. The target id must exist in the catalogue
   * (enforced by the conformance test).
   */
  driftsTo?: {
    sceneId: string;
    afterMinutes: number;
    /** Defaults to DEFAULT_DRIFT_CROSSFADE_SECONDS if omitted. */
    crossfadeSeconds?: number;
  };
}

export interface SceneElementDefinition {
  /** Layer id within the scene, e.g. 'forest-day:wind'. */
  id: string;
  /** Display label, e.g. 'Wind in leaves'. */
  label: string;
  /** Variants — 2–4 recordings of the same element type, per the brief. */
  variants: SceneVariantDefinition[];
  /**
   * Per-layer loop offset in seconds. Use a different true prime per layer
   * in a scene so the combined pattern is incommensurate (Music for
   * Airports). MUST be one of `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS` below —
   * 199 / 251 / 409 / 521 / 691 / 887. (The old "prime-adjacent" suggestions
   * 253 / 407 / 511 / 689 / 893 were NOT pairwise coprime — 253 = 11·23 and
   * 407 = 11·37 share gcd 11 — so they repeated within ~2.6 h. The
   * conformance test enforces the on-list values.)
   */
  loopOffsetSeconds: number;
  /** Crossfade overlap in seconds. Brief minimum: 5. */
  crossfadeSeconds?: number;
  /** Default volume in [0, 1]. */
  defaultVolume: number;
  /** Variant rotation policy. */
  variantRotation?: 'sequential' | 'random';
}

export interface SceneVariantDefinition {
  /** Variant id within the element. */
  id: string;
  /**
   * URL to the audio file. Resolved at scene-load time and decoded into
   * an AudioBuffer before the scene is allowed to start (per §3.5: "audio
   * files preloaded before the scene starts playing").
   */
  url: string;
  /** Optional preview text for the file (license, source, attribution). */
  attribution?: string;
}

/**
 * Suggested layer loop offsets for incommensurate looping. Pick a different
 * value per layer in a scene so the combined pattern doesn't repeat for
 * many hours (Brian Eno *Music for Airports* technique).
 *
 * All values are exact primes — pairwise gcd is 1, so the LCM of any
 * subset is their product. Even the smallest pair (199 × 251 = 49,949 s
 * ≈ 13.9 hours) won't repeat within an overnight session.
 *
 * (The previous values 253, 407, 511, 689, 893 were "prime-adjacent" — but
 * 253 = 11·23 and 407 = 11·37 share gcd 11, giving an LCM of only ~2.6 h,
 * which IS audible across an 8-hour sleep. These are all true primes.)
 *
 * 199 was added 2026-08-18 for dense-texture beds whose best source
 * recordings run 3:20–4:15 (the FTUS bundle's cricket choruses — see
 * notes/personal-sounds-selection-2026-08-17.md). A 3:19 loop is short, so
 * reserve it for featureless textures with no landmark events; anything
 * with a one-off transient (a crow caw, a distant horn) belongs on a
 * longer prime or out of the pool.
 */
export const PRIME_ADJACENT_LOOP_OFFSETS_SECONDS: readonly number[] = [
  199, // 3:19 — dense featureless beds only (crickets); see note above
  251, // 4:11
  409, // 6:49
  521, // 8:41
  691, // 11:31
  887, // 14:47
] as const;
