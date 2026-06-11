import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import {
  installLifecycleListeners,
  recordEvent,
} from './diagnostics/lifecycleLog';
import { BUILD_ID } from './lib/buildInfo';
import './index.css';

// Install lifecycle listeners BEFORE the first paint. We want to capture
// the earliest visibilitychange/freeze/pagehide events possible — the
// overnight Android crash mode is the tab being frozen ~5 min after going
// hidden, and missing those events would mean missing the diagnostic.
installLifecycleListeners();
// Stamp which build this session ran. The SW skips skipWaiting(), so a
// deploy only takes over on a cold start — after an overnight incident
// this line is what settles "did the phone actually run the new code?"
recordEvent('build', BUILD_ID);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

// Service worker registration. Production-only — Vite's dev server serves
// modules from /src/* paths the SW doesn't know about, and HMR doesn't play
// well with a precaching SW. The SW is the resilience layer for cold starts
// on flaky connections; intercepting dev traffic gains us nothing.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
