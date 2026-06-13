import { describe, expect, it } from 'vitest';
import { storyExcerpt } from './storyExcerpt';

describe('storyExcerpt', () => {
  it('returns the first sentence', () => {
    expect(storyExcerpt('You walk along the shore. The tide is low.')).toBe(
      'You walk along the shore.'
    );
  });

  it('strips Claude stage markers', () => {
    expect(
      storyExcerpt('[softly] You drift [pause] toward the water.')
    ).toBe('You drift toward the water.');
  });

  it('truncates a long opening at a word boundary with an ellipsis', () => {
    const long = 'You walk and walk and walk along a very long and winding path that goes on and on past the meadow and over the hill and through the trees';
    const out = storyExcerpt(long, 60);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith('…')).toBe(true);
    // The text before the ellipsis is whole words (cut on a space boundary),
    // so dropping the ellipsis leaves no trailing partial — every space-
    // separated token came from the original.
    const tokens = out.slice(0, -1).trim().split(' ');
    expect(long.startsWith(tokens.join(' '))).toBe(true);
  });

  it('returns empty string for empty / marker-only input', () => {
    expect(storyExcerpt('')).toBe('');
    expect(storyExcerpt('[pause] [softly]')).toBe('');
  });

  it('falls back to the whole text when there is no sentence terminator', () => {
    expect(storyExcerpt('a quiet harbour at dusk')).toBe('a quiet harbour at dusk');
  });
});
