import { defineConfig } from 'vitest/config';

// Vitest config — kept separate from vite.config.ts because the dev-server
// section there is irrelevant to test runs and the test setup needs jsdom.
//
// Tests live alongside their source as `*.test.ts`. The audio engine is
// mostly testable as pure functions (crossfade math, slider mappings,
// settings merges) — that's where the value is. Tests that need a real
// AudioContext are out of scope; Web Audio in jsdom is faked via
// `window.AudioContext = undefined`, which surfaces as a clear error if
// any test reaches for it.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
});
