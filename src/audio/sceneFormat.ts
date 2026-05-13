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
}

export interface SceneElementDefinition {
  /** Layer id within the scene, e.g. 'forest-day:wind'. */
  id: string;
  /** Display label, e.g. 'Wind in leaves'. */
  label: string;
  /** Variants — 2–4 recordings of the same element type, per the brief. */
  variants: SceneVariantDefinition[];
  /**
   * Per-layer loop offset in seconds. PRIME-ADJACENT durations across
   * layers in the same scene give Music for Airports incommensurate
   * looping. Suggested values: 253 (4:13), 407 (6:47), 511 (8:31), 689
   * (11:29), 893 (14:53).
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
 * subset is their product. Even the smallest pair (251 × 409 = 102,659 s
 * ≈ 28.5 hours) won't repeat within an overnight session.
 *
 * (The previous values 253, 407, 511, 689, 893 were "prime-adjacent" — but
 * 253 = 11·23 and 407 = 11·37 share gcd 11, giving an LCM of only ~2.6 h,
 * which IS audible across an 8-hour sleep. These five are true primes.)
 */
export const PRIME_ADJACENT_LOOP_OFFSETS_SECONDS: readonly number[] = [
  251, // 4:11
  409, // 6:49
  521, // 8:41
  691, // 11:31
  887, // 14:47
] as const;
