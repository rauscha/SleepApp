import { describe, it, expect, vi, afterEach } from 'vitest';
import { tapFeedback } from './haptics';

type VibrateNav = Navigator & { vibrate?: unknown };

function clearVibrate() {
  Reflect.deleteProperty(navigator, 'vibrate');
}

afterEach(clearVibrate);

describe('tapFeedback', () => {
  it('buzzes for a short default duration', () => {
    const vibrate = vi.fn(() => true);
    (navigator as VibrateNav).vibrate = vibrate;
    expect(tapFeedback()).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(40);
  });

  it('accepts an explicit duration', () => {
    const vibrate = vi.fn(() => true);
    (navigator as VibrateNav).vibrate = vibrate;
    tapFeedback(120);
    expect(vibrate).toHaveBeenCalledWith(120);
  });

  it('is a no-op where vibrate is unsupported (iOS Safari)', () => {
    expect(tapFeedback()).toBe(false);
  });

  it('swallows a throwing implementation', () => {
    (navigator as VibrateNav).vibrate = () => {
      throw new Error('blocked');
    };
    expect(tapFeedback()).toBe(false);
  });
});
