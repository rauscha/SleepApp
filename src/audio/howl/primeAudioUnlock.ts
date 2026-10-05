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
// **_unlockAudio() returns immediately when Howler has no AudioContext yet**
// (`if (self._audioUnlocked || !self.ctx) return;` in Howler 2.2.4), and
// Howler only builds that context lazily, on the first volume()/mute() call
// or the first Howl. At startup there is none. So until 2026-10-04 this
// primer was a silent no-op, and the bug it describes was live: on
// 2026-10-04 monsoon opened silent, the start fired only on the next tap
// (`howl-bed-start-on-unlock`), and the layers limped in one by one as
// visibility changes retried them. It had been hidden by Chrome's media
// engagement history for the site, which a full data clear wiped.
// Howler.volume() with no argument is a getter that also runs Howler's
// context setup, so it is called first.
//
// These are private/implementation details, so this is defensive: if a
// future Howler changes them, we are no worse off than before.

import { Howler } from 'howler';

interface HowlerInternals {
  ctx?: unknown;
  volume?: () => unknown;
  _unlockAudio?: () => void;
}

/** Returns true when Howler had a context to arm the unlock with. */
export function primeAudioUnlock(): boolean {
  try {
    const howler = Howler as unknown as HowlerInternals;
    if (!howler.ctx) howler.volume?.(); // builds Howler's AudioContext
    howler._unlockAudio?.();
    return Boolean(howler.ctx);
  } catch {
    /* older/newer Howler — the app behaves as it did before this call */
    return false;
  }
}
