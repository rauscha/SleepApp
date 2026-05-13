import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the Sleep App PWA.
// We keep the audio worklet as a static asset under /worklets so we can pass
// the URL directly to AudioContext.audioWorklet.addModule(). Vite will serve
// /public/* at the site root.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Allow tailnet hosts (e.g. crane-desk.saiga-wage.ts.net) when proxied
    // via `tailscale serve`. Leading-dot is Vite's wildcard for subdomains —
    // covers every device in this tailnet without disabling host protection
    // entirely. localhost / LAN-IP access is unaffected.
    allowedHosts: ['.saiga-wage.ts.net'],
    // Don't trigger a Vite page reload when test files change — Vitest
    // runs them separately, and a full reload in the running app kills
    // any in-progress audio session.
    watch: {
      ignored: ['**/*.test.ts', '**/*.test.tsx'],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
