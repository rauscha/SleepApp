import { afterEach, describe, expect, it, vi } from 'vitest';
import { isInstalledApp, requestFullscreenSafe } from './fullscreen';

function displayMode(mode: 'browser' | 'standalone') {
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
