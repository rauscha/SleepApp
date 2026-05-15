import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetForTests,
  clearLog,
  formatAsText,
  getAllEntries,
  installLifecycleListeners,
  recordEvent,
} from './lifecycleLog';

// jsdom provides localStorage + document + window. We reset between tests
// so cached state and installed listeners don't leak between cases.

describe('lifecycle log', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetForTests();
  });

  it('records an event and reads it back via getAllEntries', () => {
    recordEvent('test-event', 'hello');
    const entries = getAllEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('test-event');
    expect(entries[0]?.detail).toBe('hello');
    expect(typeof entries[0]?.ts).toBe('number');
  });

  it('omits detail when not supplied', () => {
    recordEvent('bare-event');
    const entries = getAllEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.detail).toBeUndefined();
  });

  it('caps the log at MAX_ENTRIES, dropping oldest first', () => {
    // MAX_ENTRIES is 500 — push 510 and verify only the last 500 survive.
    for (let i = 0; i < 510; i++) recordEvent('e', `n=${i}`);
    const entries = getAllEntries();
    expect(entries).toHaveLength(500);
    // First surviving entry should be n=10 (entries 0–9 were rotated out).
    expect(entries[0]?.detail).toBe('n=10');
    expect(entries[entries.length - 1]?.detail).toBe('n=509');
  });

  it('persists entries to localStorage', () => {
    recordEvent('persisted-event', 'x');
    const raw = localStorage.getItem('sleep-app:lifecycle-log:v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].kind).toBe('persisted-event');
  });

  it('clearLog wipes both cache and localStorage', () => {
    recordEvent('to-be-cleared');
    expect(getAllEntries()).toHaveLength(1);
    clearLog();
    expect(getAllEntries()).toHaveLength(0);
    expect(localStorage.getItem('sleep-app:lifecycle-log:v1')).toBeNull();
  });

  it('installLifecycleListeners is idempotent and records app-start once', () => {
    installLifecycleListeners();
    installLifecycleListeners();
    installLifecycleListeners();
    const starts = getAllEntries().filter((e) => e.kind === 'app-start');
    expect(starts).toHaveLength(1);
  });

  it('loads previously persisted entries on first install', () => {
    // Pre-seed storage as if a previous session wrote it.
    localStorage.setItem(
      'sleep-app:lifecycle-log:v1',
      JSON.stringify([
        { ts: 1000, kind: 'prior-event', detail: 'one' },
        { ts: 2000, kind: 'another' },
      ])
    );
    installLifecycleListeners();
    const entries = getAllEntries();
    // 2 prior + 1 app-start = 3
    expect(entries).toHaveLength(3);
    expect(entries[0]?.kind).toBe('prior-event');
    expect(entries[1]?.kind).toBe('another');
    expect(entries[2]?.kind).toBe('app-start');
  });

  it('survives a corrupt stored payload by starting fresh', () => {
    localStorage.setItem('sleep-app:lifecycle-log:v1', '{ not json');
    installLifecycleListeners();
    const entries = getAllEntries();
    // Falls back to empty + app-start. No crash.
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('app-start');
  });

  it('drops malformed entries from a partially corrupt payload', () => {
    localStorage.setItem(
      'sleep-app:lifecycle-log:v1',
      JSON.stringify([
        { ts: 1000, kind: 'good' },
        'not-an-object',
        { ts: 'bad-ts', kind: 'malformed' },
        { ts: 2000 }, // missing kind
        { ts: 3000, kind: 'also-good' },
      ])
    );
    installLifecycleListeners();
    const entries = getAllEntries();
    // 2 valid prior + 1 app-start
    expect(entries.map((e) => e.kind)).toEqual([
      'good',
      'also-good',
      'app-start',
    ]);
  });

  it('formatAsText includes a header and one line per entry', () => {
    recordEvent('first');
    recordEvent('second', 'with-detail');
    const text = formatAsText();
    expect(text).toContain('Sleep app lifecycle log');
    expect(text).toContain('Entries: 2');
    expect(text).toContain('first');
    expect(text).toContain('second');
    expect(text).toContain('with-detail');
  });

  it('formatAsText handles an empty log without crashing', () => {
    const text = formatAsText();
    expect(text).toContain('Entries: 0');
  });
});
