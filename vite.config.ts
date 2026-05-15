import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Injects a precache manifest into public/sw.js after build. The service
// worker needs the exact hashed JS/CSS filenames to addAll() them on
// install — without that, the first offline visit hangs at the splash
// because the SW only caches the unhashed app-shell URLs. Runs as a
// post-bundle string replace, not a virtual import, so the SW file
// remains a plain JS file that runs unmodified in dev.
function swPrecachePlugin(): Plugin {
  return {
    name: 'sw-precache-inject',
    apply: 'build',
    writeBundle: {
      sequential: true,
      handler(_options, bundle) {
        const precache: string[] = ['/', '/manifest.json', '/icons/icon.svg'];
        for (const key of Object.keys(bundle)) {
          if (key.startsWith('assets/') &&
              (key.endsWith('.js') || key.endsWith('.css'))) {
            precache.push('/' + key);
          }
        }
        const swPath = resolve('dist/sw.js');
        const original = readFileSync(swPath, 'utf8');
        const marker = '/* @sw-precache */ []';
        if (!original.includes(marker)) {
          throw new Error(
            `sw-precache-inject: marker "${marker}" not found in dist/sw.js`
          );
        }
        const replaced = original.replace(
          marker,
          `/* @sw-precache */ ${JSON.stringify(precache)}`
        );
        writeFileSync(swPath, replaced, 'utf8');
      },
    },
  };
}

// Vite config for the Sleep App PWA.
// We keep the audio worklet as a static asset under /worklets so we can pass
// the URL directly to AudioContext.audioWorklet.addModule(). Vite will serve
// /public/* at the site root.
export default defineConfig({
  // basicSsl() ships a self-signed cert so the dev + preview servers are
  // reachable over HTTPS from phones on the LAN. AudioWorklet (and any
  // other secure-context-only API) won't load over plain http://<host>
  // — only http://localhost gets the secure-context exemption. Tap
  // through the cert warning once per device.
  plugins: [react(), basicSsl(), swPrecachePlugin()],
  server: {
    port: 5173,
    host: true,
    // Allow tailnet hosts (e.g. crane-desk.saiga-wage.ts.net) when proxied
    // via `tailscale serve`. Leading-dot is Vite's wildcard for subdomains —
    // covers every device in this tailnet without disabling host protection
    // entirely. localhost / LAN-IP access is unaffected.
    allowedHosts: ['.saiga-wage.ts.net', 'crane-desk', '.local'],
    // Don't trigger a Vite page reload when test files change — Vitest
    // runs them separately, and a full reload in the running app kills
    // any in-progress audio session.
    watch: {
      ignored: ['**/*.test.ts', '**/*.test.tsx'],
    },
  },
  // Preview serves the production build. PWA install on Android needs
  // HTTPS, so the expected access pattern is `tailscale serve --bg
  // --https=443 http://localhost:4173` and then visit
  // https://<device>.saiga-wage.ts.net from the phone. Mirror the dev
  // server's tailnet allowance here so Vite's Host filter doesn't reject it.
  preview: {
    port: 4173,
    host: true,
    allowedHosts: ['.saiga-wage.ts.net', 'crane-desk', '.local'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
