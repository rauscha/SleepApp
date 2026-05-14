import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './index.css';

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
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
