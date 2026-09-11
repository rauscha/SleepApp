// Debug markers — "I am hearing something wrong, right now."
//
// The problem this replaces: noticing a bad seam or a doubled layer at 2am
// and having to reach for a stopwatch to time it, then reconstructing hours
// later which file that even was. A marker records, at the instant of the
// tap, which scene was playing, which variant file every layer had picked,
// and where inside its loop each one was — enough to re-render exactly what
// was in the room and listen to it again at the desk.
//
// Local-only, like the lifecycle log: a separate localStorage key so a
// night's markers can't be pushed out of the 500-entry event log, and
// nothing leaves the device unless the user shares it. Off by default,
// behind the `debugMarkers` setting.

import { BUILD_ID } from '../lib/buildInfo';
import { getAllEntries, recordEvent } from './lifecycleLog';
import type { HowlLayerSnapshot } from '../audio/howl/HowlScene';

const STORAGE_KEY = 'sleep-app:markers:v1';
/** Generous — a marker is a few hundred bytes and a bad night might want
 *  dozens. Oldest are dropped first. */
const MAX_MARKERS = 200;
/** Lifecycle-log lines kept with each marker for context. */
const RECENT_EVENT_COUNT = 8;
/** A layer this close to either side of its loop wrap is worth suspecting
 *  when the user reports a seam. Deliberately wide: the audit's wrap window
 *  is 6s and a half-awake tap lands seconds after the sound. */
export const SEAM_WINDOW_SECONDS = 10;

export type MarkerTrigger = 'nightstand' | 'lush' | 'media-key' | 'test';

export interface DebugMarker {
  /** Stable id — wall-clock ms plus a counter, unique within a session. */
  id: string;
  /** Wall clock at the tap (ms since epoch). */
  ts: number;
  sceneId: string;
  sceneLabel: string;
  /** When the current scene started, so elapsed survives a screen exit. */
  sceneStartedAt: number;
  elapsedMs: number;
  trigger: MarkerTrigger;
  /** Optional note, typed later in Settings → Diagnostics. */
  note?: string;
  layers: HowlLayerSnapshot[];
  masterVolume: number;
  timerStatus: string;
  /** The last few lifecycle-log lines before the tap, as text. */
  recentEvents: string[];
}

/** What the caller supplies; id/elapsed/recentEvents are filled in here. */
export type NewMarker = Omit<DebugMarker, 'id' | 'elapsedMs' | 'recentEvents'>;

let cache: DebugMarker[] | null = null;
let counter = 0;

function load(): DebugMarker[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed.filter(isMarker) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function isMarker(v: unknown): v is DebugMarker {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Partial<DebugMarker>;
  return (
    typeof m.id === 'string' &&
    typeof m.ts === 'number' &&
    typeof m.sceneId === 'string' &&
    Array.isArray(m.layers)
  );
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache ?? []));
  } catch {
    // Quota / private mode — the in-memory copy still works for this
    // session, which is enough to share it before the tab goes away.
  }
}

/**
 * Record a marker. Returns the stored marker so a caller can show its
 * timestamp back to the user immediately.
 */
export function addMarker(input: NewMarker): DebugMarker {
  const marker: DebugMarker = {
    ...input,
    id: `${input.ts}-${counter++}`,
    elapsedMs: Math.max(0, input.ts - input.sceneStartedAt),
    recentEvents: captureRecentEvents(input.ts),
  };
  const all = load();
  all.push(marker);
  if (all.length > MAX_MARKERS) cache = all.slice(all.length - MAX_MARKERS);
  persist();
  // Cross-reference: the lifecycle log is the other half of the timeline.
  recordEvent('debug-marker', `${marker.sceneId} @${formatClock(marker.elapsedMs)}`);
  return marker;
}

function captureRecentEvents(before: number): string[] {
  return getAllEntries()
    .filter((e) => e.ts <= before)
    .slice(-RECENT_EVENT_COUNT)
    .map((e) => {
      const rel = ((e.ts - before) / 1000).toFixed(1);
      return `${rel}s ${e.kind}${e.detail ? ` (${e.detail})` : ''}`;
    });
}

export function getMarkers(): DebugMarker[] {
  return [...load()];
}

export function clearMarkers(): void {
  cache = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function deleteMarker(id: string): void {
  const all = load().filter((m) => m.id !== id);
  cache = all;
  persist();
}

/** Attach or replace a marker's note. Empty text clears it. */
export function setMarkerNote(id: string, note: string): void {
  const all = load();
  const marker = all.find((m) => m.id === id);
  if (!marker) return;
  const trimmed = note.trim();
  if (trimmed) marker.note = trimmed;
  else delete marker.note;
  persist();
}

// ---------------------------------------------------------------------------
// Analysis helpers — shared by the on-device panel and tools/review-markers.py

/**
 * How far this layer was from its loop wrap, in seconds. The wrap is at
 * both ends of the file, so a position near 0 is just past it and a
 * position near the period is just before it.
 */
export function wrapDistanceSeconds(
  seekSeconds: number | null,
  periodSeconds: number
): number | null {
  if (seekSeconds === null || !(periodSeconds > 0)) return null;
  const pos = ((seekSeconds % periodSeconds) + periodSeconds) % periodSeconds;
  return Math.min(pos, periodSeconds - pos);
}

/**
 * Layers that were within SEAM_WINDOW_SECONDS of their loop wrap when the
 * marker was taken — the ones to listen to first.
 *
 * A position near 0 only counts once the layer has actually been round at
 * least once. Every layer sits at position ~0 for the first seconds of a
 * scene, and that is the file's start, not a wrap: without this, a marker
 * taken early would flag the entire stack and mean nothing. A position near
 * the end of the file is always reported — the wrap is imminent there, and a
 * tap lags the sound that prompted it by a second or more.
 */
export function seamSuspects(marker: DebugMarker): HowlLayerSnapshot[] {
  return marker.layers.filter((l) => isSeamSuspect(marker, l));
}

/** The per-layer test behind seamSuspects. Takes the layer itself rather
 *  than its id so callers can't be tripped up by a duplicate id. */
export function isSeamSuspect(
  marker: DebugMarker,
  layer: HowlLayerSnapshot
): boolean {
  const d = wrapDistanceSeconds(layer.seekSeconds, layer.periodSeconds);
  if (d === null || d > SEAM_WINDOW_SECONDS) return false;
  const position = layer.seekSeconds! % layer.periodSeconds;
  const justPastWrap = position <= SEAM_WINDOW_SECONDS;
  if (justPastWrap && marker.elapsedMs / 1000 < layer.periodSeconds) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Export

/** `1:04:12` / `2:13` — elapsed, the way a stopwatch would have read. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

function formatLocalTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ` +
    `${sign}${pad(Math.floor(absMin / 60))}:${pad(absMin % 60)}`
  );
}

/**
 * Human-readable export — local wall clock (the reader is reconstructing
 * their own night), elapsed since the scene started, and per layer the file,
 * its position in its loop and the distance to the wrap.
 */
export function formatMarkersAsText(): string {
  const markers = getMarkers();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const lines = [
    'Sleep app debug markers',
    `Build: ${BUILD_ID}`,
    `Device: ${ua}`,
    `Markers: ${markers.length}`,
    `Generated: ${formatLocalTimestamp(Date.now())}`,
    '',
  ];
  for (const m of markers) {
    lines.push(
      `── ${formatLocalTimestamp(m.ts)}  ${m.sceneLabel} (${m.sceneId})  ` +
        `+${formatClock(m.elapsedMs)} into the scene  [${m.trigger}]`
    );
    if (m.note) lines.push(`   note: ${m.note}`);
    lines.push(
      `   master ${Math.round(m.masterVolume * 100)}%  timer ${m.timerStatus}`
    );
    for (const l of m.layers) {
      const d = wrapDistanceSeconds(l.seekSeconds, l.periodSeconds);
      const pos =
        l.seekSeconds === null
          ? '   ?  '
          : `${l.seekSeconds.toFixed(1)}s`.padStart(7);
      const wrap =
        d === null
          ? ''
          : isSeamSuspect(m, l)
            ? `  ** ${d.toFixed(1)}s FROM WRAP **`
            : `  (${d.toFixed(0)}s from wrap)`;
      lines.push(
        `   ${l.label.padEnd(16)} ${pos} / ${String(l.periodSeconds).padStart(3)}s  ` +
          `vol ${l.volume.toFixed(2)}${l.playing ? '' : '  [NOT PLAYING]'}${wrap}`
      );
      lines.push(`   ${' '.repeat(16)} ${l.url}`);
    }
    if (m.recentEvents.length) {
      lines.push(`   events: ${m.recentEvents.join(' | ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Machine-readable export — the input to tools/review-markers.py. */
export function exportMarkersJson(): string {
  return JSON.stringify(
    {
      build: BUILD_ID,
      device: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      generatedAt: Date.now(),
      seamWindowSeconds: SEAM_WINDOW_SECONDS,
      markers: getMarkers(),
    },
    null,
    2
  );
}

/** Test hook — wipe in-memory state without touching localStorage. */
export function __resetMarkersForTests(): void {
  cache = null;
  counter = 0;
}
