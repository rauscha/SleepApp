import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS toggle.
//
// Default (unset): Vite serves plain HTTP on localhost:5175. `tailscale
// serve --bg --https=443 http://localhost:5175` then terminates TLS with
// a publicly-trusted Let's Encrypt cert on the tailnet hostname (e.g.
// https://crane-desk.saiga-wage.ts.net), reachable from any device on
// the tailnet — phones included — with no per-device CA install. This is
// the recommended dev path; see notes/dev-cert-android.md.
//
// VITE_USE_HTTPS=1: Vite terminates TLS itself, binding to all interfaces.
// Prefers a mkcert-generated cert under certs/ (Android Chrome needs the
// mkcert root CA installed on the device for this path — see the same
// note). Falls back to basicSsl()'s localhost-only self-signed cert if
// certs/ is missing, which is fine for desktop browsers but useless for
// LAN access from phones.
const USE_HTTPS = process.env['VITE_USE_HTTPS'] === '1';
const CERT_KEY = resolve(__dirname, 'certs/dev-key.pem');
const CERT_CRT = resolve(__dirname, 'certs/dev-cert.pem');
const hasMkcert = existsSync(CERT_KEY) && existsSync(CERT_CRT);
const httpsOptions = USE_HTTPS && hasMkcert
  ? { key: readFileSync(CERT_KEY), cert: readFileSync(CERT_CRT) }
  : undefined;

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
  // basicSsl() is only needed in the VITE_USE_HTTPS path when no mkcert
  // pair is present. Default tailscale path is plain HTTP — no TLS plugin.
  plugins: [
    react(),
    ...(USE_HTTPS && !hasMkcert ? [basicSsl()] : []),
    swPrecachePlugin(),
  ],
  server: {
    // strictPort because `tailscale serve` is hardcoded to forward to
    // localhost:5175 — if Vite silently slid to 5176 (port in use), the
    // tailnet URL would 502 with no obvious cause. Better to fail loud
    // and free the port.
    port: 5175,
    strictPort: true,
    // localhost-only in the tailscale path: the only thing on this box
    // that needs to reach Vite is the tailscaled daemon, which lives on
    // the same machine. host: true (all interfaces) is only useful when
    // Vite terminates TLS itself, so it's gated on USE_HTTPS.
    host: USE_HTTPS ? true : 'localhost',
    https: httpsOptions,
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
    strictPort: true,
    host: USE_HTTPS ? true : 'localhost',
    https: httpsOptions,
    allowedHosts: ['.saiga-wage.ts.net', 'crane-desk', '.local'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
