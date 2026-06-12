import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAudioEngine } from './audio/AudioEngine';
import { getSceneCoordinator } from './audio/SceneCoordinator';
import { TonightScreen } from './screens/TonightScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import type { ContentItem } from './screens/LibraryScreen';

// Lazy-load post-Tonight screens. Together these pull in Howler (~30 kB),
// the Library + StoryGenerator UI trees, and the storyGenerator service —
// none of which is needed for the primary flow (Tonight → Player). The
// initial bundle now contains only the audio engine + Tonight/Player.
// A user who only ever taps a scene card never downloads any of this.
const SettingsScreen = lazy(() =>
  import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))
);
const LibraryScreen = lazy(() =>
  import('./screens/LibraryScreen').then((m) => ({ default: m.LibraryScreen }))
);
const ContentPlayerScreen = lazy(() =>
  import('./screens/ContentPlayerScreen').then((m) => ({
    default: m.ContentPlayerScreen,
  }))
);
const StoryGeneratorScreen = lazy(() =>
  import('./screens/StoryGeneratorScreen').then((m) => ({
    default: m.StoryGeneratorScreen,
  }))
);
// Dev-only engine harness — its own chunk, only ever imported in dev. The
// route that mounts it is also gated on import.meta.env.DEV, so a production
// build tree-shakes the import away entirely.
const Harness = lazy(() =>
  import('./dev/Harness').then((m) => ({ default: m.Harness }))
);

function ScreenFallback() {
  return <div className="h-full bg-ink-950" aria-hidden="true" />;
}

type Screen =
  | 'tonight'
  | 'player'
  | 'library'
  | 'content-player'
  | 'story-generator'
  | 'settings'
  | 'harness';

// Screens where the persistent bottom nav stays hidden — the immersive
// player surfaces shouldn't have UI chrome under them while the user is
// drifting off, and ContentPlayer is similarly task-focused.
const IMMERSIVE_SCREENS = new Set<Screen>(['player', 'content-player']);


export function App() {
  const engine = useMemo(() => getAudioEngine(), []);
  // Run unlock() on EVERY audio gesture, not just the first. unlock() is
  // idempotent and near-free when the context is already running, and the
  // play tap IS the user gesture the Web Audio API requires. The previous
  // latched version had a fatal flaw: if the context died overnight (OS
  // suspended it, or killed the rendering thread), restarting playback
  // never re-attempted an in-gesture resume — so the app stayed silent
  // until a full kill-and-restart. unlock() also rebuilds a context the
  // platform refuses to resume; see AudioEngine.recreateContext.
  const ensureUnlocked = useCallback(async () => {
    await engine.unlock();
  }, [engine]);

  // Initial screen: if a scene is already playing (HMR or reopened PWA
  // with persisted audio state) jump to the player; otherwise always land
  // straight on Tonight — the app's home. We intentionally do NOT restore
  // the last-visited screen: reopening the app should put the scene picker
  // in front of someone who's about to sleep, not wherever they last
  // browsed (e.g. Library). No Begin interstitial.
  const [screen, setScreen] = useState<Screen>(() => {
    if (engine.isInitialized) {
      const coord = getSceneCoordinator(engine);
      if (coord.getCurrentScene()) return 'player';
    }
    return 'tonight';
  });

  const [activeContent, setActiveContent] = useState<ContentItem | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // ── History-based back-button handling ──────────────────────────────
  //
  // Without this, the browser/PWA back button leaves the app entirely
  // (or closes the PWA window), killing playback. We push one synthetic
  // history entry on every screen change so the next back press lands
  // there. On popstate we always navigate to Tonight and re-push, so
  // the user can never accidentally exit the app by pressing back. The
  // single exception is the user's own back navigation between screens,
  // which goes through setScreen and is independent of history.
  useEffect(() => {
    // Seed one history entry so the first back press has somewhere to land.
    try {
      window.history.replaceState({ screen: 'tonight', sentinel: true }, '');
      window.history.pushState({ screen, sentinel: true }, '');
    } catch {
      /* history disabled (rare; sandboxed iframe) */
    }
    const onPopState = () => {
      // User pressed back — return to Tonight rather than leaving the app.
      // Run the same content-leave cleanup as "← Library" (bug M5): if a
      // content blob URL is live, revoke it and clear the active content,
      // or hardware-back from the content player leaks a story's ~45 MB
      // blob for the page's lifetime. blobUrlRef is a ref so this closure
      // (empty-deps effect) always sees the current value.
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setActiveContent(null);
      setScreen('tonight');
      try {
        window.history.pushState({ screen: 'tonight', sentinel: true }, '');
      } catch {
        /* noop */
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playContent = useCallback(
    async (item: ContentItem) => {
      await ensureUnlocked();
      // Revoke any previous content blob before overwriting the ref — a
      // back-to-back play of two stories would otherwise strand the first
      // one's ~45 MB object URL for the page's lifetime (bug M5).
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      if (item.audioUrl.startsWith('blob:')) blobUrlRef.current = item.audioUrl;
      setActiveContent(item);
      setScreen('content-player');
    },
    [ensureUnlocked]
  );

  const leaveContentPlayer = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setActiveContent(null);
    setScreen('library');
  }, []);

  const showNav = !IMMERSIVE_SCREENS.has(screen);

  return (
    <div className="h-full w-full bg-ink-950 text-stone-100 flex flex-col overflow-hidden">
      <main
        className={
          'flex-1 min-h-0 overflow-y-auto overscroll-contain' +
          (showNav ? ' pb-2' : '')
        }
      >
        {screen === 'tonight' && (
          <TonightScreen
            onPlaybackStarted={() => setScreen('player')}
            onDevToolsRequested={() => setScreen('harness')}
            ensureUnlocked={ensureUnlocked}
          />
        )}
        {screen === 'player' && (
          <PlayerScreen onExit={() => setScreen('tonight')} />
        )}
        {screen === 'library' && (
          <Suspense fallback={<ScreenFallback />}>
            <LibraryScreen
              onBack={() => setScreen('tonight')}
              onPlay={(item) => void playContent(item)}
              onGenerateStory={() => setScreen('story-generator')}
            />
          </Suspense>
        )}
        {screen === 'content-player' && activeContent && (
          <Suspense fallback={<ScreenFallback />}>
            <ContentPlayerScreen
              title={activeContent.title}
              description={activeContent.description}
              audioUrl={activeContent.audioUrl}
              bedSceneId={activeContent.sceneId ?? null}
              bedBehavior={activeContent.type === 'story' ? 'continue' : 'stop-with-content'}
              onBack={leaveContentPlayer}
            />
          </Suspense>
        )}
        {screen === 'story-generator' && (
          <Suspense fallback={<ScreenFallback />}>
            <StoryGeneratorScreen
              onBack={() => setScreen('library')}
              onDone={() => setScreen('library')}
            />
          </Suspense>
        )}
        {screen === 'settings' && (
          <Suspense fallback={<ScreenFallback />}>
            <SettingsScreen onBack={() => setScreen('tonight')} />
          </Suspense>
        )}
        {screen === 'harness' && import.meta.env.DEV && (
          <Suspense fallback={<ScreenFallback />}>
            <Harness onBackToTonight={() => setScreen('tonight')} />
          </Suspense>
        )}
      </main>
      {showNav && <BottomNav current={screen} onNavigate={setScreen} />}
    </div>
  );
}

// ── BottomNav ──────────────────────────────────────────────────────────
//
// Always-visible bottom tab bar with three primary destinations: Tonight
// (scenes), Library (meditations + stories), Settings. Hidden on
// immersive Player + ContentPlayer screens.

function BottomNav({
  current,
  onNavigate,
}: {
  current: Screen;
  onNavigate: (s: Screen) => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className="shrink-0 border-t border-ink-700 bg-ink-950
                 flex items-stretch justify-around
                 pb-[env(safe-area-inset-bottom)]"
    >
      <NavButton
        active={current === 'tonight'}
        label="Tonight"
        icon={<MoonIcon />}
        onClick={() => onNavigate('tonight')}
      />
      <NavButton
        active={current === 'library'}
        label="Library"
        icon={<BookIcon />}
        onClick={() => onNavigate('library')}
      />
      <NavButton
        active={current === 'settings'}
        label="Settings"
        icon={<GearIcon />}
        onClick={() => onNavigate('settings')}
      />
    </nav>
  );
}

function NavButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={[
        'flex-1 flex flex-col items-center justify-center gap-1',
        'py-2 transition-colors duration-slow',
        active ? 'text-moon-300' : 'text-stone-400 hover:text-stone-300',
      ].join(' ')}
      style={{ minHeight: 56 }}
    >
      <span className="block" aria-hidden="true">
        {icon}
      </span>
      <span className="text-xs tracking-wide">{label}</span>
    </button>
  );
}

// Stroke-based monochrome icons drawn with currentColor so they inherit the
// nav button's active/idle text colour. 20×20 keeps them visually balanced
// with the 11px label without crowding the 56px target area.

function MoonIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z" />
      <path d="M22 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

