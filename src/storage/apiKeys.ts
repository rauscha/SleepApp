// API key resolution.
//
// Build-time env vars (VITE_ANTHROPIC_API_KEY, VITE_ELEVENLABS_API_KEY) are
// a DEV-ONLY convenience for the single-user personal build. Every read is
// gated on `import.meta.env.DEV`, which Vite replaces with a literal `false`
// in a production build — so the constant-folded `false ? import.meta.env.
// VITE_… : null` drops the VITE_* reference entirely and `npm run build` can
// NEVER inline a live key into the shipped bundle, even if one is present in
// the build environment (review security Medium / roadmap 3.2). CI already
// refuses to pass keys; this closes the local-build hole structurally.
//
// Production always uses the user-provided keys in localStorage (Settings →
// AI features) — the bring-your-own-key flow is unchanged.

import { getSetting } from './settings';

function envValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** DEV-only env key reads. In a prod build these fold to `null` and the
 *  VITE_* reference is dead-code-eliminated from the bundle. */
function anthropicEnvKey(): string | null {
  return import.meta.env.DEV
    ? envValue(import.meta.env.VITE_ANTHROPIC_API_KEY)
    : null;
}

function elevenLabsEnvKey(): string | null {
  return import.meta.env.DEV
    ? envValue(import.meta.env.VITE_ELEVENLABS_API_KEY)
    : null;
}

export function getAnthropicApiKey(): string | null {
  return anthropicEnvKey() ?? getSetting('anthropicApiKey');
}

export function getElevenLabsApiKey(): string | null {
  return elevenLabsEnvKey() ?? getSetting('elevenLabsApiKey');
}

export function hasAnthropicEnvKey(): boolean {
  return anthropicEnvKey() !== null;
}

export function hasElevenLabsEnvKey(): boolean {
  return elevenLabsEnvKey() !== null;
}
