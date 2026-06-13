// The 3 a.m. Door (roadmap 6.1) — a single near-black panel shown when the
// app is opened in the deep-night window with nothing playing.
//
// Design rules (deliberately spare): no nav, no photos, no white text, no
// bright surfaces. One line, one tap to resume the last scene softly; a dim
// escape hatch in the corner for the rare case the user actually wants the
// full app at 3am. The text is intentionally low-contrast warm-stone — at
// this hour, protecting night vision beats WCAG. The whole surface sits on
// true black (#000), darker than the app's already-deep ink-950, so the
// screen emits as little light as possible.

export interface DeepNightDoorProps {
  /** Resume the last scene gently and stay dark. */
  onResume: () => void;
  /** Escape hatch — open the normal app (Tonight). */
  onOpenApp: () => void;
}

export function DeepNightDoor({ onResume, onOpenApp }: DeepNightDoorProps) {
  return (
    <div
      className="fixed inset-0 bg-black flex flex-col items-center justify-center px-8"
      role="main"
      aria-label="Back to sleep"
    >
      <button
        onClick={onResume}
        className="font-serif text-2xl text-stone-500 active:text-stone-400
                   transition-colors duration-slow text-center leading-relaxed"
        style={{ minHeight: 44, minWidth: 44 }}
      >
        Back to sleep
      </button>

      {/* Dim escape hatch — barely there. */}
      <button
        onClick={onOpenApp}
        className="absolute bottom-8 right-8 ui-label text-stone-700
                   active:text-stone-500 transition-colors duration-slow px-3 py-3"
        style={{ minHeight: 44 }}
        aria-label="Open the app"
      >
        open the app
      </button>
    </div>
  );
}
