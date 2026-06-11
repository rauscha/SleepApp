// Build identity — answers "which build is actually running on the phone?"
//
// Why this exists: the service worker deliberately skips skipWaiting(), so
// a new deploy only takes over on the next cold start. After an overnight
// incident there was no way to tell whether the night ran the old or new
// code. The build id is stamped into the lifecycle log at every app start
// (see main.tsx) and shown in Settings → Diagnostics, so both the live app
// and any exported log state their build unambiguously.
//
// __BUILD_ID__ is injected by `define` in vite.config.ts (git short SHA +
// UTC build time). The typeof guard keeps Vitest — which uses its own
// config without the define — and any other non-Vite tooling from crashing
// on the bare global.

declare const __BUILD_ID__: string | undefined;

export const BUILD_ID: string =
  typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
