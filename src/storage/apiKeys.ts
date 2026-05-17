// API key resolution.
//
// Prefer build-time env vars (VITE_ANTHROPIC_API_KEY,
// VITE_ELEVENLABS_API_KEY) when present — these are baked into the bundle
// for the single-user dev/personal build. Fall back to the user-provided
// keys stored in localStorage (Settings → AI features) so the public
// bring-your-own-key flow still works when env keys are absent.

import { getSetting } from './settings';

function envValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getAnthropicApiKey(): string | null {
  return (
    envValue(import.meta.env.VITE_ANTHROPIC_API_KEY) ??
    getSetting('anthropicApiKey')
  );
}

export function getElevenLabsApiKey(): string | null {
  return (
    envValue(import.meta.env.VITE_ELEVENLABS_API_KEY) ??
    getSetting('elevenLabsApiKey')
  );
}

export function hasAnthropicEnvKey(): boolean {
  return envValue(import.meta.env.VITE_ANTHROPIC_API_KEY) !== null;
}

export function hasElevenLabsEnvKey(): boolean {
  return envValue(import.meta.env.VITE_ELEVENLABS_API_KEY) !== null;
}
