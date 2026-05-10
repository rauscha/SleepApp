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
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
