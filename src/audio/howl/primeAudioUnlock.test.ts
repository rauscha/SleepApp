import { describe, expect, it, vi, beforeEach } from 'vitest';

// A stand-in for Howler's global with the 2.2.4 behaviour that matters:
// volume() builds the AudioContext lazily, and _unlockAudio() does nothing
// unless that context already exists.
const fake = vi.hoisted(() => {
  const state = { ctx: null as unknown, listenersInstalled: false };
  const Howler = {
    get ctx() {
      return state.ctx;
    },
    volume: vi.fn(() => {
      if (!state.ctx) state.ctx = { state: 'suspended' };
      return 1;
    }),
    _unlockAudio: vi.fn(() => {
      if (!state.ctx) return; // the early return that made the old primer a no-op
      state.listenersInstalled = true;
    }),
  };
  return { state, Howler };
});

vi.mock('howler', () => ({ Howler: fake.Howler }));

import { primeAudioUnlock } from './primeAudioUnlock';

describe('primeAudioUnlock', () => {
  beforeEach(() => {
    fake.state.ctx = null;
    fake.state.listenersInstalled = false;
    vi.clearAllMocks();
  });

  it('builds Howler\'s AudioContext first, so the unlock listeners really install', () => {
    // Without the volume() call this stays false: _unlockAudio() bails when
    // there is no context, which is how the 2026-10-04 silent start happened.
    expect(primeAudioUnlock()).toBe(true);
    expect(fake.Howler.volume).toHaveBeenCalledTimes(1);
    expect(fake.state.listenersInstalled).toBe(true);
  });

  it('does not rebuild a context that already exists', () => {
    fake.state.ctx = { state: 'running' };
    primeAudioUnlock();
    expect(fake.Howler.volume).not.toHaveBeenCalled();
    expect(fake.state.listenersInstalled).toBe(true);
  });
});
