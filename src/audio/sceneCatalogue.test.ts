// Scene-catalogue conformance test (roadmap step 2.2).
//
// The project's most sacred rule — pairwise-coprime prime loop offsets so a
// scene never sounds like a tape loop (CLAUDE.md "incommensurate-loops
// rule") — was enforced by nothing. rain-on-window shipped an off-list 515
// offset for weeks and four independent reviewers caught it before any test
// did. This makes the contract enforce itself: it reads every shipped scene
// JSON, the index, and the per-variant sidecars (via Vite's import.meta.glob
// so it needs no node types) and asserts the CLAUDE.md hard rules.
//
// Hard failures (the contract): >=2 elements, every loopOffsetSeconds on the
// PRIME_ADJACENT list, offsets distinct within a scene, every referenced
// variant file present, and every variant's file length EQUAL to its offset
// (within encode-frame slack), plus volumes inside a sane range. Softer
// mix-voicing guidance is surfaced as warnings, not failures.
//
// Why "equal to" and not "longer than": under the Howler html5 engine each
// layer loops the WHOLE file natively, so the file *is* the loop — its length
// must be the element's prime offset. (Pre-pivot, FileLayer crossfaded within
// a longer file, so the rule was "longer than offset + crossfade".)
//
// Format: scene audio is migrating from MP3 to Opus (2026-06-30 — see
// DECISIONS.md "Ship scene audio as Opus, not MP3"). Both extensions are
// accepted here during the migration; `loopify-scenes.py` is what actually
// converts a scene's files and rewrites its JSON to `.opus`, one scene at a
// time — this test doesn't force the pace.

import { describe, expect, it } from 'vitest';
import { PRIME_ADJACENT_LOOP_OFFSETS_SECONDS } from './sceneFormat';
import type { SceneDefinition } from './sceneFormat';

// Frame/packet granularity means a file trimmed to N seconds lands within
// ~0.1s of N; allow a little slack on top of that.
const LENGTH_TOLERANCE_SECONDS = 2.5;
const VALID_OFFSETS = new Set(PRIME_ADJACENT_LOOP_OFFSETS_SECONDS);

// Eager glob: scene JSONs + every sidecar, keyed by project-root path.
// Lazy glob for the audio files — we only need the keys to assert existence.
const sceneModules = import.meta.glob<{ default: SceneDefinition }>(
  '/public/scenes/*.json',
  { eager: true }
);
const indexModules = import.meta.glob<{ default: { scenes: Array<{ id: string; url: string }> } }>(
  '/public/scenes/index.json',
  { eager: true }
);
const sidecarModules = import.meta.glob<{ default: { trimmedTo?: string } }>(
  '/public/audio/**/*.json',
  { eager: true }
);
const audioPaths = new Set([
  ...Object.keys(import.meta.glob('/public/audio/**/*.mp3')),
  ...Object.keys(import.meta.glob('/public/audio/**/*.opus')),
]);

const sceneEntries = Object.entries(sceneModules)
  .filter(([path]) => !path.endsWith('/index.json'))
  .map(([path, mod]) => ({ path, scene: mod.default }))
  .sort((a, b) => a.scene.id.localeCompare(b.scene.id));

const warnings: string[] = [];

/** site-root variant URL ("/audio/...") → project-root glob key. */
function publicKey(url: string): string {
  return '/public' + (url.startsWith('/') ? url : '/' + url);
}

/** Variant duration from its sidecar `trimmedTo`, else null (warn-skip). */
function sidecarDuration(url: string): number | null {
  const sidecarKey = publicKey(url).replace(/\.(mp3|opus)$/, '.json');
  const mod = sidecarModules[sidecarKey];
  const trimmed = mod?.default.trimmedTo?.match(/(\d+(?:\.\d+)?)\s*s/);
  return trimmed ? parseFloat(trimmed[1]!) : null;
}

describe('scene catalogue conformance', () => {
  it('finds at least the shipped scenes on disk', () => {
    expect(sceneEntries.length).toBeGreaterThanOrEqual(8);
  });

  it('every driftsTo target exists in the catalogue (Night Drift)', () => {
    const ids = new Set(sceneEntries.map((e) => e.scene.id));
    for (const { scene } of sceneEntries) {
      const drift = scene.driftsTo;
      if (!drift) continue;
      expect(
        ids.has(drift.sceneId),
        `${scene.id}: driftsTo target "${drift.sceneId}" is not a scene`
      ).toBe(true);
      expect(drift.afterMinutes, `${scene.id}: driftsTo.afterMinutes`).toBeGreaterThan(0);
      expect(drift.sceneId).not.toBe(scene.id); // don't drift to yourself
    }
  });

  it('index.json and the scene files agree', () => {
    const index = Object.values(indexModules)[0]!.default;
    const indexIds = index.scenes.map((s) => s.id).sort();
    const fileIds = sceneEntries.map((e) => e.scene.id).sort();
    expect(fileIds).toEqual(indexIds);
    // Every index url resolves to a scene JSON we loaded.
    for (const entry of index.scenes) {
      expect(
        sceneModules[publicKey(entry.url)] !== undefined,
        `${entry.url} not found`
      ).toBe(true);
    }
  });

  for (const { scene } of sceneEntries) {
    describe(scene.id, () => {
      it('has at least 2 layered elements', () => {
        expect(scene.elements.length).toBeGreaterThanOrEqual(2);
      });

      it('uses only on-list loop offsets, distinct within the scene', () => {
        const offsets = scene.elements.map((e) => e.loopOffsetSeconds);
        for (const off of offsets) {
          expect(
            VALID_OFFSETS.has(off),
            `${scene.id}: offset ${off} is not on PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`
          ).toBe(true);
        }
        expect(new Set(offsets).size, `${scene.id}: duplicate offsets`).toBe(
          offsets.length
        );
      });

      it('keeps every variant present and looped to its prime offset', () => {
        for (const el of scene.elements) {
          for (const variant of el.variants) {
            expect(
              audioPaths.has(publicKey(variant.url)),
              `${variant.url} missing on disk`
            ).toBe(true);
            const duration = sidecarDuration(variant.url);
            // A missing / duration-less sidecar is a HARD failure, not a soft
            // warn. A wrong-length file breaks the incommensurate-loops math
            // (the core audio design); it must not pass the suite merely by
            // lacking a sidecar. Every variant needs a sidecar with trimmedTo.
            expect(
              duration,
              `${scene.id}/${el.id}/${variant.id}: no sidecar duration — every variant needs a sidecar with trimmedTo`
            ).not.toBeNull();
            // The file IS the loop: its length must equal the element's prime
            // offset so native looping doesn't tick or resync early.
            expect(
              Math.abs(duration! - el.loopOffsetSeconds),
              `${scene.id}/${el.id}/${variant.id}: ${duration}s != offset ${el.loopOffsetSeconds}s`
            ).toBeLessThanOrEqual(LENGTH_TOLERANCE_SECONDS);
          }
        }
      });

      it('keeps layer volumes in a sane range (warns outside the voicing bands)', () => {
        // Hard bounds: nothing silent, nothing hot enough to dominate/clip.
        expect(scene.synth.defaultVolume).toBeGreaterThanOrEqual(0.08);
        expect(scene.synth.defaultVolume).toBeLessThanOrEqual(0.2);
        // Soft: CLAUDE.md voicing — synth bed 0.10–0.16.
        if (scene.synth.defaultVolume < 0.1 || scene.synth.defaultVolume > 0.16) {
          warnings.push(
            `${scene.id}: synth bed ${scene.synth.defaultVolume} outside voicing band 0.10–0.16`
          );
        }
        for (const el of scene.elements) {
          expect(
            el.defaultVolume,
            `${scene.id}/${el.id}: volume ${el.defaultVolume} out of sane range`
          ).toBeGreaterThan(0);
          expect(el.defaultVolume).toBeLessThanOrEqual(0.62);
          // Soft: primary ~0.55–0.60, support 0.25–0.35, events <=~0.20.
          const inBand =
            (el.defaultVolume >= 0.55 && el.defaultVolume <= 0.6) ||
            (el.defaultVolume >= 0.25 && el.defaultVolume <= 0.35) ||
            el.defaultVolume <= 0.2;
          if (!inBand) {
            warnings.push(
              `${scene.id}/${el.id}: volume ${el.defaultVolume} outside the voicing bands`
            );
          }
        }
      });
    });
  }

  it('reports soft warnings (margins, voicing) — never fails on them', () => {
    if (warnings.length > 0) {
      console.warn(
        `[scene-conformance] ${warnings.length} soft warning(s):\n  ` +
          warnings.join('\n  ')
      );
    }
    expect(true).toBe(true);
  });
});
