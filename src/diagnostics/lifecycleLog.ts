// Lifecycle log — captures the page-lifecycle events that matter for
// diagnosing overnight crashes (Chrome on Android, primarily). Persisted
// to localStorage so the next launch can read back what happened before
// the tab died.
//
// Why this exists: the Chrome page lifecycle goes
//   visible → hidden → frozen (~5 min after hidden) → discarded.
// On Android, a tab playing pure Web Audio with no MediaSession and no
// Wake Lock can be discarded after ~10 min of being backgrounded. From
// inside the page we can't see "discarded" (the page is gone), but we
// CAN see the freeze event firing, and that's the smoking gun.
//
// This module is intentionally tiny — it ships with the app and runs
// from the very first paint so we don't miss early events.

const STORAGE_KEY = 'sleep-app:lifecycle-log:v1';
const MAX_ENTRIES = 500;

export interface LogEntry {
  /** Wall-clock timestamp (ms since epoch). */
  ts: number;
  /** Event kind — short identifier like "freeze" or "visibility-hidden". */
  kind: string;
  /** Optional detail string. Kept short — long strings just bloat storage. */
  detail?: string;
}

let installed = false;
let cache: LogEntry[] = [];

function loadFromStorage(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is LogEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as LogEntry).ts === 'number' &&
        typeof (e as LogEntry).kind === 'string'
    );
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Quota exceeded / private mode — best effort. The in-memory cache
    // still has everything, so the user can still copy/share from the UI.
  }
}

/**
 * Append an event to the log. Caps the log at MAX_ENTRIES by dropping
 * the oldest entries first. Cheap enough to call freely.
 */
export function recordEvent(kind: string, detail?: string): void {
  const entry: LogEntry = { ts: Date.now(), kind };
  if (detail !== undefined) entry.detail = detail;
  cache.push(entry);
  if (cache.length > MAX_ENTRIES) {
    cache = cache.slice(cache.length - MAX_ENTRIES);
  }
  persist();
}

export function getAllEntries(): LogEntry[] {
  return [...cache];
}

export function clearLog(): void {
  cache = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Render the log as plain text suitable for pasting into chat/email or
 * eyeballing on a phone. Each line: ISO timestamp, relative offset from
 * the first entry, kind, and optional detail. Header includes the device
 * userAgent and entry count.
 */
export function formatAsText(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const lines = [
    `Sleep app lifecycle log`,
    `Device: ${ua}`,
    `Entries: ${cache.length}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
  ];
  const start = cache[0]?.ts ?? Date.now();
  for (const e of cache) {
    const iso = new Date(e.ts).toISOString();
    const relSec = ((e.ts - start) / 1000).toFixed(1);
    const detail = e.detail ? `  (${e.detail})` : '';
    lines.push(`${iso}  +${relSec.padStart(8)}s  ${e.kind}${detail}`);
  }
  return lines.join('\n');
}

/**
 * Install global page-lifecycle listeners. Idempotent — safe to call
 * multiple times. Should be invoked once at app start, before the first
 * paint, so we capture the earliest events (including the rare case of
 * the tab being put straight into the background after install).
 */
export function installLifecycleListeners(): void {
  if (installed) return;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  installed = true;

  cache = loadFromStorage();

  // Mark the start of each session with the UA prefix so multi-session
  // logs are easy to scan visually.
  recordEvent(
    'app-start',
    typeof navigator !== 'undefined'
      ? navigator.userAgent.slice(0, 120)
      : 'unknown'
  );

  document.addEventListener('visibilitychange', () => {
    recordEvent(`visibility-${document.visibilityState}`);
  });

  // Chrome page-lifecycle: 'freeze' fires when the browser transitions the
  // tab to the frozen state (no JS runs after this until 'resume'). This
  // is THE event we care about for the Android 10-minute crash.
  document.addEventListener('freeze', () => {
    recordEvent('freeze');
  });
  document.addEventListener('resume', () => {
    recordEvent('resume');
  });

  // pagehide/pageshow with persisted=true indicates BFCache entry/exit.
  // pagehide is also the closest thing to a "tab is being unloaded" hook
  // we have — useful as a tombstone.
  window.addEventListener('pagehide', (e) => {
    recordEvent('pagehide', `persisted=${(e as PageTransitionEvent).persisted}`);
  });
  window.addEventListener('pageshow', (e) => {
    recordEvent('pageshow', `persisted=${(e as PageTransitionEvent).persisted}`);
  });

  // Uncaught errors and rejected promises — these can crash audio
  // scheduling silently. Cap the detail string so a giant stack trace
  // doesn't blow the storage budget.
  window.addEventListener('error', (e) => {
    const msg = (e as ErrorEvent).message ?? '?';
    const where = `${(e as ErrorEvent).filename ?? '?'}:${
      (e as ErrorEvent).lineno ?? '?'
    }`;
    recordEvent('error', `${msg} @${where}`.slice(0, 200));
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    const text =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : JSON.stringify(reason);
    recordEvent('unhandled-rejection', text.slice(0, 200));
  });
}

/** Test hook — wipe state without touching localStorage. */
export function __resetForTests(): void {
  cache = [];
  installed = false;
}
