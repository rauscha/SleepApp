import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetMarkersForTests,
  addMarker,
  clearMarkers,
  deleteMarker,
  exportMarkersJson,
  formatClock,
  formatMarkersAsText,
  getMarkers,
  SEAM_WINDOW_SECONDS,
  seamSuspects,
  setMarkerNote,
  wrapDistanceSeconds,
  type NewMarker,
} from './markers';
import { __resetForTests as resetLifecycleLog, recordEvent } from './lifecycleLog';
import type { HowlLayerSnapshot } from '../audio/howl/HowlScene';

function layer(over: Partial<HowlLayerSnapshot> = {}): HowlLayerSnapshot {
  return {
    id: 'forest-night:wind-in-leaves',
    label: 'Wind in leaves',
    url: '/audio/forest-day/wind-in-leaves/wind-1.opus',
    periodSeconds: 521,
    seekSeconds: 260,
    volume: 0.45,
    outer: 0.4,
    playing: true,
    ...over,
  };
}

function marker(over: Partial<NewMarker> = {}): NewMarker {
  return {
    ts: 1_800_000_000_000,
    sceneId: 'forest-night',
    sceneLabel: 'Forest, night',
    sceneStartedAt: 1_800_000_000_000 - 3_600_000,
    trigger: 'nightstand',
    layers: [layer()],
    masterVolume: 0.4,
    timerStatus: 'running',
    ...over,
  };
}

describe('debug markers', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetMarkersForTests();
    resetLifecycleLog();
  });

  it('stores a marker with elapsed time filled in', () => {
    const m = addMarker(marker());
    expect(m.elapsedMs).toBe(3_600_000);
    expect(getMarkers()).toHaveLength(1);
    expect(getMarkers()[0]!.sceneId).toBe('forest-night');
  });

  it('gives each marker a distinct id even within the same millisecond', () => {
    const a = addMarker(marker());
    const b = addMarker(marker());
    expect(a.id).not.toBe(b.id);
  });

  it('never reports negative elapsed time if the clock moved', () => {
    const m = addMarker(marker({ sceneStartedAt: 1_800_000_000_000 + 5_000 }));
    expect(m.elapsedMs).toBe(0);
  });

  it('captures the lifecycle events leading up to the tap', () => {
    recordEvent('scene-start', 'forest-night');
    recordEvent('visibility-hidden');
    const m = addMarker(marker({ ts: Date.now() }));
    expect(m.recentEvents.join(' ')).toContain('scene-start');
    expect(m.recentEvents.join(' ')).toContain('visibility-hidden');
  });

  it('ignores lifecycle events recorded after the tap', () => {
    const m = addMarker(marker({ ts: Date.now() - 60_000 }));
    expect(m.recentEvents.join(' ')).not.toContain('debug-marker');
  });

  it('writes its own line into the lifecycle log for cross-reference', async () => {
    addMarker(marker({ ts: Date.now() }));
    const { getAllEntries } = await import('./lifecycleLog');
    expect(getAllEntries().some((e) => e.kind === 'debug-marker')).toBe(true);
  });

  it('survives a reload', () => {
    addMarker(marker());
    __resetMarkersForTests();
    expect(getMarkers()).toHaveLength(1);
  });

  it('drops a corrupt stored payload rather than throwing', () => {
    localStorage.setItem('sleep-app:markers:v1', '{not json');
    __resetMarkersForTests();
    expect(getMarkers()).toEqual([]);
  });

  it('filters out entries that are not markers', () => {
    localStorage.setItem(
      'sleep-app:markers:v1',
      JSON.stringify([{ nope: true }, null, 7])
    );
    __resetMarkersForTests();
    expect(getMarkers()).toEqual([]);
  });

  it('adds, replaces and clears a note', () => {
    const m = addMarker(marker());
    setMarkerNote(m.id, '  clicky seam on the wind  ');
    expect(getMarkers()[0]!.note).toBe('clicky seam on the wind');
    setMarkerNote(m.id, '');
    expect(getMarkers()[0]!.note).toBeUndefined();
  });

  it('ignores a note for an unknown marker', () => {
    addMarker(marker());
    expect(() => setMarkerNote('nope', 'x')).not.toThrow();
  });

  it('deletes one marker and clears all', () => {
    const a = addMarker(marker());
    addMarker(marker());
    deleteMarker(a.id);
    expect(getMarkers()).toHaveLength(1);
    clearMarkers();
    expect(getMarkers()).toEqual([]);
  });
});

describe('wrap distance', () => {
  it('measures to the nearer end of the loop', () => {
    expect(wrapDistanceSeconds(3, 251)).toBe(3);
    expect(wrapDistanceSeconds(249, 251)).toBe(2);
    expect(wrapDistanceSeconds(125.5, 251)).toBe(125.5);
  });

  it('handles a position past one full loop', () => {
    expect(wrapDistanceSeconds(251 + 4, 251)).toBe(4);
  });

  it('returns null when the position or period is unknown', () => {
    expect(wrapDistanceSeconds(null, 251)).toBeNull();
    expect(wrapDistanceSeconds(10, 0)).toBeNull();
  });
});

describe('seam suspects', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetMarkersForTests();
    resetLifecycleLog();
  });

  it('flags only the layers near their wrap', () => {
    const m = addMarker(
      marker({
        layers: [
          layer({ id: 'a', seekSeconds: 2, periodSeconds: 251 }),
          layer({ id: 'b', seekSeconds: 519.5, periodSeconds: 521 }),
          layer({ id: 'c', seekSeconds: 200, periodSeconds: 409 }),
          layer({ id: 'd', seekSeconds: null }),
        ],
      })
    );
    expect(seamSuspects(m).map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('does not flag the first play-through, when every layer sits near zero', () => {
    // 20s into the scene: all three layers are a few seconds into their
    // files, which is the start of the file and not a wrap.
    const m = addMarker(
      marker({
        ts: 1_800_000_000_000,
        sceneStartedAt: 1_800_000_000_000 - 20_000,
        layers: [
          layer({ id: 'a', seekSeconds: 2, periodSeconds: 251 }),
          layer({ id: 'b', seekSeconds: 3, periodSeconds: 409 }),
          layer({ id: 'c', seekSeconds: 4, periodSeconds: 887 }),
        ],
      })
    );
    expect(seamSuspects(m)).toEqual([]);
  });

  it('flags a layer past its wrap once it has been round once', () => {
    const m = addMarker(
      marker({
        ts: 1_800_000_000_000,
        sceneStartedAt: 1_800_000_000_000 - 300_000, // 5 min in
        layers: [
          // 251s loop, so it has wrapped; 2s past the wrap.
          layer({ id: 'wrapped', seekSeconds: 2, periodSeconds: 251 }),
          // 887s bed hasn't been round yet — still its first play-through.
          layer({ id: 'bed', seekSeconds: 2, periodSeconds: 887 }),
        ],
      })
    );
    expect(seamSuspects(m).map((l) => l.id)).toEqual(['wrapped']);
  });

  it('always flags a layer about to wrap, however early in the scene', () => {
    const m = addMarker(
      marker({
        ts: 1_800_000_000_000,
        sceneStartedAt: 1_800_000_000_000 - 20_000,
        layers: [layer({ id: 'ending', seekSeconds: 249, periodSeconds: 251 })],
      })
    );
    expect(seamSuspects(m).map((l) => l.id)).toEqual(['ending']);
  });

  it('uses an inclusive window', () => {
    const m = addMarker(
      marker({
        layers: [layer({ id: 'edge', seekSeconds: SEAM_WINDOW_SECONDS, periodSeconds: 251 })],
      })
    );
    expect(seamSuspects(m)).toHaveLength(1);
  });
});

describe('marker export', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetMarkersForTests();
    resetLifecycleLog();
  });

  it('formats elapsed time like a stopwatch', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(133_000)).toBe('2:13');
    expect(formatClock(3_852_000)).toBe('1:04:12');
  });

  it('names the file and flags the layer that was at its wrap', () => {
    addMarker(
      marker({
        layers: [
          layer({ id: 'w', label: 'Wind', seekSeconds: 519, periodSeconds: 521 }),
          layer({ id: 'c', label: 'Creek', seekSeconds: 130, periodSeconds: 251 }),
        ],
      })
    );
    const text = formatMarkersAsText();
    expect(text).toContain('Forest, night');
    expect(text).toContain('wind-1.opus');
    expect(text).toContain('FROM WRAP');
    expect(text.match(/FROM WRAP/g)).toHaveLength(1);
  });

  it('includes a note when one was added', () => {
    const m = addMarker(marker());
    setMarkerNote(m.id, 'thump every few minutes');
    expect(formatMarkersAsText()).toContain('thump every few minutes');
  });

  it('exports JSON the review tool can read', () => {
    addMarker(marker());
    const parsed = JSON.parse(exportMarkersJson());
    expect(parsed.seamWindowSeconds).toBe(SEAM_WINDOW_SECONDS);
    expect(parsed.markers).toHaveLength(1);
    expect(parsed.markers[0].layers[0].url).toContain('wind-1.opus');
  });

  it('produces a header even with no markers', () => {
    expect(formatMarkersAsText()).toContain('Markers: 0');
  });
});
