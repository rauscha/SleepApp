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
  /**
   * Called when the OS / lock-screen / headset triggers a play action.
   * For ambient scenes there's no real "pause/resume" semantics — we
   * map play to "resume the AudioContext if it got suspended". Wiring
   * this handler is what gets the lock-screen play button to appear.
   */
  onPlay?: () => void;
  /**
   * Called when the OS / lock-screen / headset triggers a pause action.
   * Map to whatever the app considers a soft-stop (e.g. fade-and-stop).
   */
  onPause?: () => void;
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
 * in place. Sets `playbackState = 'playing'`.
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
  if (handlers.onPlay !== undefined) {
    safeSetActionHandler('play', handlers.onPlay);
  }
  if (handlers.onPause !== undefined) {
    safeSetActionHandler('pause', handlers.onPause);
  }
}

/**
 * Flip the OS-visible playback state without changing metadata or
 * handlers. Use when the user pauses/resumes a meditation or story so
 * the lock-screen widget shows the right play/pause icon.
 */
export function setMediaSessionPlaybackState(
  state: 'playing' | 'paused' | 'none'
): void {
  if (!hasMediaSession()) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {
    /* noop */
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
  safeSetActionHandler('play', null);
  safeSetActionHandler('pause', null);
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
