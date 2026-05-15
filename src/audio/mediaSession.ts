// MediaSession integration — tells the OS "this tab is a media session".
//
// Why this matters: Chrome on Android treats tabs with no recognised media
// session as low-priority and may discard them after ~10 minutes in the
// background. Setting MediaMetadata + at least one action handler raises
// the priority and surfaces the scene name on the lock screen / system
// media controls / Bluetooth headset display.
//
// This is NOT a notification (the brief's "no notifications, ever" rule
// is intact) — MediaSession is a passive metadata channel the OS uses
// when the user is already interacting with media controls.

export interface SceneMediaHandlers {
  /** Called when the OS / lock-screen / headset triggers a stop action. */
  onStop?: () => void;
}

function hasMediaSession(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'mediaSession' in navigator &&
    typeof MediaMetadata !== 'undefined'
  );
}

/**
 * Tell the OS we're playing `sceneLabel`. Safe to call repeatedly — each
 * call replaces the previous metadata. Action handlers are registered
 * idempotently; pass `onStop: undefined` to leave the existing handler
 * in place.
 */
export function setMediaSessionForScene(
  sceneLabel: string,
  handlers: SceneMediaHandlers = {}
): void {
  if (!hasMediaSession()) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: sceneLabel,
      artist: 'Sleep',
    });
    navigator.mediaSession.playbackState = 'playing';
  } catch {
    /* old browser or denied */
  }
  if (handlers.onStop !== undefined) {
    safeSetActionHandler('stop', handlers.onStop);
  }
}

/**
 * Clear all session state. Call when the scene stops or the player
 * unmounts so the lock-screen widget doesn't keep showing a finished
 * scene.
 */
export function clearMediaSession(): void {
  if (!hasMediaSession()) return;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  } catch {
    /* noop */
  }
  safeSetActionHandler('stop', null);
}

function safeSetActionHandler(
  action: MediaSessionAction,
  handler: (() => void) | null
): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    /* unsupported action on this browser — ignore */
  }
}
