// Install Howler's audio-unlock listeners before the user's first tap.
//
// The bug this fixes: Howler satisfies the browser's autoplay policy with a
// one-shot unlock pass, registered lazily the first time a Howl is
// constructed and run on the next document-level gesture. In this app the
// first Howl is built *inside* the tap that picks a scene, so the listeners
// do not exist yet for that tap — the unlock is deferred to the user's NEXT
// gesture, and when it finally runs it calls load() on every element,
// aborting the media requests the scene has in flight (net::ERR_ABORTED).
// Layers caught by that can end up with no data at all and never start: the
// first scene of a session plays silent, and only starts once you tap
// around enough to trigger the unlock and a fresh scene build.
//
// Calling _unlockAudio() at startup registers the listeners (it does not
// itself unlock anything without a gesture, and it is a no-op once audio is
// unlocked). The user's scene tap then completes the unlock during the
// capture phase, before React's click handler runs and before any layer
// starts loading — so nothing gets aborted.
//
// It is a private field, so this is defensive: if a future Howler renames
// it, we are no worse off than before.

import { Howler } from 'howler';

export function primeAudioUnlock(): void {
  try {
    const global = Howler as unknown as { _unlockAudio?: () => void };
    global._unlockAudio?.();
  } catch {
    /* older/newer Howler — the app behaves as it did before this call */
  }
}
