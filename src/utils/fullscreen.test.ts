import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentDisplayMode,
  isInstalledApp,
  isStatusBarHidden,
  requestFullscreenSafe,
} from './fullscreen';

function displayMode(mode: 'browser' | 'standalone' | 'fullscreen') {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q === `(display-mode: ${mode})`,
  }));
}

describe('requestFullscreenSafe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not go fullscreen in the installed app (no toast on every wake)', () => {
    displayMode('standalone');
    const req = vi.fn(() => Promise.resolve());
    document.documentElement.requestFullscreen = req;
    expect(isInstalledApp()).toBe(true);
    requestFullscreenSafe();
    expect(req).not.toHaveBeenCalled();
  });

  it('still goes fullscreen in a browser tab', () => {
    displayMode('browser');
    const req = vi.fn(() => Promise.resolve());
    document.documentElement.requestFullscreen = req;
    expect(isInstalledApp()).toBe(false);
    requestFullscreenSafe();
    expect(req).toHaveBeenCalledTimes(1);
  });
});

describe('isStatusBarHidden', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is false in the standalone window, where Android draws its own clock', () => {
    // The 2026-10-06 double clock: a phone still on the old WebAPK runs
    // standalone, so the Nightstand clock must stay out of the way.
    displayMode('standalone');
    expect(currentDisplayMode()).toBe('standalone');
    expect(isStatusBarHidden()).toBe(false);
  });

  it('is true once the installed app runs in fullscreen display mode', () => {
    displayMode('fullscreen');
    expect(currentDisplayMode()).toBe('fullscreen');
    expect(isInstalledApp()).toBe(true);
    expect(isStatusBarHidden()).toBe(true);
  });

  it('is false in a plain browser tab that is not fullscreen', () => {
    displayMode('browser');
    expect(currentDisplayMode()).toBe('browser');
    expect(isStatusBarHidden()).toBe(false);
  });
});
