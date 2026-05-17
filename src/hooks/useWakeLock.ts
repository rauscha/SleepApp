// useWakeLock — keep the screen awake (or rather, keep the *device* from
// suspending the page) while audio is playing.
//
// Why: on Android, Chrome aggressively backgrounds tabs whose screen has
// dimmed — even with MediaSession set, the wall-clock-and-CPU pressure of
// a black screen tilts the heuristic toward "freeze". A Screen Wake Lock
// is the documented signal that says "the user is actively engaged with
// this tab, do not freeze it". It does NOT physically keep the screen on
// against the OS sleep timer in all cases (Android still respects the
// user's screen-off gesture), but it raises the foreground-keep-alive
// priority enough to materially reduce the discard rate.
//
// Lifecycle quirks:
//   - The lock is *released* automatically when the document becomes
//     hidden. We listen for `visibilitychange` and re-request on return.
//     The brief's "no demands on the user" rule is preserved: re-acquiring
//     a lock on visible doesn't prompt or alert anyone.
//   - On unsupported browsers (Safari < 16.4, anything else without the
//     API) the hook is a no-op — `active` stays false and no errors
//     surface. Wake Lock is a best-effort layer, not a hard dependency.
//   - StrictMode mounts the effect twice in dev; the second mount
//     re-acquires which is harmless, and the cleanup releases. We avoid
//     storing the sentinel in React state to keep re-render cost zero.

import { useEffect, useRef, useState } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
}

function hasWakeLock(): boolean {
  if (typeof navigator === 'undefined') return false;
  return Boolean((navigator as NavigatorWithWakeLock).wakeLock);
}

/**
 * Acquire a screen wake lock while `enabled` is true. The hook owns the
 * sentinel and handles Android's "release-on-hidden" quirk by re-requesting
 * the lock on visibilitychange. Returns the current acquisition state for
 * diagnostics (typically you don't need to render it).
 */
export function useWakeLock(enabled: boolean): { active: boolean } {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!hasWakeLock()) return;

    let cancelled = false;

    const acquire = async () => {
      // Don't request when the document is hidden — the browser will
      // reject it anyway. We'll pick it up on the next visibilitychange.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      // If we already hold a non-released sentinel, no-op.
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        const wl = (navigator as NavigatorWithWakeLock).wakeLock;
        if (!wl) return;
        const sentinel = await wl.request('screen');
        if (cancelled) {
          // We were unmounted between the await and now — release
          // immediately so we don't hold the lock past our lifetime.
          sentinel.release().catch(() => undefined);
          return;
        }
        sentinelRef.current = sentinel;
        setActive(true);
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
            setActive(false);
          }
        });
      } catch {
        // Permission denied, low-battery refusal, document not visible —
        // all expected. Stay silent; this is a best-effort layer.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void acquire();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void acquire();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setActive(false);
      if (sentinel && !sentinel.released) {
        sentinel.release().catch(() => undefined);
      }
    };
  }, [enabled]);

  return { active };
}
