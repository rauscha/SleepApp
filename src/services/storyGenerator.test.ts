import { describe, it, expect } from 'vitest';
import {
  buildStoryMetadata,
  countWords,
  deriveTitle,
  estimateDurationSeconds,
  makeStoryId,
} from './storyGenerator';

// Pure-function coverage for the story generation pipeline. The network
// calls (Claude + ElevenLabs) are intentionally not mocked here — those
// are exercised by the manual smoke test (USER_TODO.md). This file
// catches regressions in title / duration / id derivation, which is the
// part most likely to silently drift under refactor.

describe('countWords', () => {
  it('returns 0 for an empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace only', () => {
    expect(countWords('   \n\t  ')).toBe(0);
  });

  it('counts words split by any whitespace', () => {
    expect(countWords('one two three')).toBe(3);
    expect(countWords('one\ttwo\nthree')).toBe(3);
    expect(countWords('  leading and trailing  ')).toBe(3);
  });

  it('treats consecutive whitespace as one separator', () => {
    expect(countWords('a    b\n\n\nc')).toBe(3);
  });
});

describe('estimateDurationSeconds', () => {
  it('returns 0 for empty script', () => {
    expect(estimateDurationSeconds('')).toBe(0);
  });

  it('uses 130 wpm by default', () => {
    // 130 words at 130 wpm = exactly 60 seconds.
    const script = Array(130).fill('word').join(' ');
    expect(estimateDurationSeconds(script)).toBe(60);
  });

  it('respects a custom wpm', () => {
    // 100 words at 100 wpm = 60 seconds.
    const script = Array(100).fill('word').join(' ');
    expect(estimateDurationSeconds(script, 100)).toBe(60);
  });

  it('rounds to the nearest second', () => {
    // 65 words at 130 wpm = 30 seconds exactly.
    const script = Array(65).fill('word').join(' ');
    expect(estimateDurationSeconds(script)).toBe(30);
  });
});

describe('deriveTitle', () => {
  it('falls back to a generic label for an empty theme', () => {
    expect(deriveTitle('')).toBe('Sleep story');
    expect(deriveTitle('   ')).toBe('Sleep story');
  });

  it('capitalizes the first letter of the theme', () => {
    expect(deriveTitle('a winter cabin')).toBe('A winter cabin');
  });

  it('preserves a theme that already starts capitalized', () => {
    expect(deriveTitle('Mountain dusk')).toBe('Mountain dusk');
  });

  it('trims surrounding whitespace before casing', () => {
    expect(deriveTitle('  autumn forest  ')).toBe('Autumn forest');
  });

  it('returns themes up to 60 chars unchanged (apart from case)', () => {
    const sixty = 'a'.repeat(60);
    expect(deriveTitle(sixty)).toBe('A' + 'a'.repeat(59));
  });

  it('soft-truncates long themes at a word boundary with an ellipsis', () => {
    const long =
      'a slow walk through an autumn forest with leaves crunching beneath your feet at dusk';
    const out = deriveTitle(long);
    expect(out.length).toBeLessThanOrEqual(61); // 60 + ellipsis
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('  ');
    // Should not split mid-word: stripping the ellipsis, the remaining
    // text must be a word-bounded prefix of the input (case-adjusted).
    const stem = out.slice(0, -1);
    const cased = 'A slow walk through an autumn forest with leaves crunching beneath your feet at dusk';
    // The char in the original right after where we cut must be a space —
    // i.e. we ended on a complete word.
    expect(cased.startsWith(stem)).toBe(true);
    expect(cased.charAt(stem.length)).toBe(' ');
  });

  it('handles a long single-word theme by hard-truncating', () => {
    const long = 'x'.repeat(100);
    const out = deriveTitle(long);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('makeStoryId', () => {
  it('embeds the timestamp', () => {
    expect(makeStoryId(1700000000000, 0.5)).toMatch(/^story-1700000000000-/);
  });

  it('produces a 6-char suffix', () => {
    const id = makeStoryId(1700000000000, 0.123456789);
    const suffix = id.split('-').pop()!;
    expect(suffix).toHaveLength(6);
  });

  it('pads short base36 suffixes to 6 chars', () => {
    // Math.random() can return values whose base36 slice is shorter than 6.
    const id = makeStoryId(1700000000000, 0);
    const suffix = id.split('-').pop()!;
    expect(suffix).toHaveLength(6);
  });
});

describe('buildStoryMetadata', () => {
  it('assembles all fields with sensible defaults', () => {
    const script = Array(260).fill('word').join(' '); // 260 / 130 wpm = 120s
    const meta = buildStoryMetadata({
      id: 'story-test-123',
      theme: 'a winter cabin',
      voiceName: 'hush',
      script,
      createdAt: '2026-05-15T00:00:00.000Z',
    });
    expect(meta).toEqual({
      id: 'story-test-123',
      title: 'A winter cabin',
      theme: 'a winter cabin',
      voiceId: 'hush',
      createdAt: '2026-05-15T00:00:00.000Z',
      durationSeconds: 120,
      script,
      sceneId: null,
    });
  });

  it('defaults createdAt to now when omitted', () => {
    const before = Date.now();
    const meta = buildStoryMetadata({
      id: 'x',
      theme: 't',
      voiceName: 'hush',
      script: 'hello world',
    });
    const after = Date.now();
    const ts = Date.parse(meta.createdAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('sceneId is always null on a fresh story', () => {
    const meta = buildStoryMetadata({
      id: 'x',
      theme: 't',
      voiceName: 'hush',
      script: 'hello',
    });
    expect(meta.sceneId).toBeNull();
  });
});
