import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAudioEngine } from './audio/AudioEngine';
import { NoiseGenerator } from './audio/NoiseGenerator';
import { TinnitusMaskLayer } from './audio/TinnitusMaskLayer';
import { ToneMatcher } from './audio/ToneMatcher';
import { FileLayer } from './audio/FileLayer';
import {
  DEFAULT_SCENE_CROSSFADE_SECONDS,
  DEFAULT_SCENE_FIRST_START_SECONDS,
  getSceneCoordinator,
} from './audio/SceneCoordinator';
import type { VariantLoadOutcome } from './audio/SceneCoordinator';
import {
  fetchSceneDefinition,
  fetchSceneIndex,
} from './audio/sceneRegistry';
import type {
  SceneIndex,
  SceneIndexEntry,
} from './audio/sceneRegistry';
import type { Scene } from './audio/Scene';
import { getAllSettings, setSetting } from './storage';
import type { NoiseColor } from './audio/types';
import { generateTestPadBuffer } from './audio/synth/testPad';
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

const SHOW_TINNITUS_HARNESS = false;

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
              onPlay={playContent}
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
        {screen === 'harness' && (
          <Harness onBackToTonight={() => setScreen('tonight')} />
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
        active ? 'text-moon-300' : 'text-stone-500 hover:text-stone-300',
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

// ── Harness (unchanged dev surface) ────────────────────────────────────

function Harness({ onBackToTonight }: { onBackToTonight: () => void }) {
  const engine = useMemo(() => getAudioEngine(), []);
  const [settings] = useState(() => getAllSettings());
  const [contextState, setContextState] = useState(engine.state);

  useEffect(() => {
    const unsub = engine.addListener((e) => {
      if (e.kind === 'state') setContextState(e.state);
    });
    return unsub;
  }, [engine]);

  return (
    <div className="bg-ink-950 text-stone-100 px-6 py-8 max-w-md mx-auto">
      <header className="mb-8 flex justify-between items-start gap-4">
        <button
          onClick={onBackToTonight}
          className="text-xs text-stone-400 hover:text-stone-200 transition-colors duration-slow shrink-0 mt-2"
          aria-label="Back to Tonight"
        >
          ← Tonight
        </button>
        <div className="text-right">
          <h1 className="text-stone-50 font-serif text-3xl">Engine harness</h1>
          <p className="text-stone-300 text-sm mt-1">
            Dev surface. AudioContext: {contextState}
          </p>
        </div>
      </header>

      <Spectrum />
      <Divider />
      <ScenesSection
        tinnitusCenterHz={settings.tinnitus.centerHz}
        tinnitusBandwidthHz={settings.tinnitus.bandwidthHz}
      />
      <Divider />
      <NoiseSection />
      <Divider />
      {SHOW_TINNITUS_HARNESS && (
        <>
          <Divider />
          <ToneMatcherSection
            initialHz={settings.tinnitus.centerHz}
            onSave={() => {
              /* save flow removed during shelving; rewire when reviving */
            }}
          />
          <Divider />
          <TinnitusMaskSection
            centerHz={settings.tinnitus.centerHz}
            bandwidthHz={settings.tinnitus.bandwidthHz}
          />
          <Divider />
        </>
      )}
      <CrossfadeSection />
      <Divider />
      <MasterSection
        initialVolume={settings.masterVolume}
        onChange={(v) => setSetting('masterVolume', v)}
      />
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-ink-700 my-8" />;
}

function Spectrum() {
  const engine = useMemo(() => getAudioEngine(), []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!engine.isInitialized) return;
    const analyser = engine.bus.analyser;
    const buf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx2d = canvas.getContext('2d');
        if (ctx2d) {
          analyser.getByteFrequencyData(buf);
          const W = canvas.width;
          const H = canvas.height;
          ctx2d.fillStyle = '#10131A';
          ctx2d.fillRect(0, 0, W, H);
          const sampleRate = engine.context.sampleRate;
          const nyquist = sampleRate / 2;
          const minHz = 30;
          ctx2d.fillStyle = '#9BB7AE';
          for (let x = 0; x < W; x++) {
            const t = x / (W - 1);
            const hz = minHz * Math.pow(nyquist / minHz, t);
            const bin = Math.min(buf.length - 1, Math.floor((hz / nyquist) * buf.length));
            const v = buf[bin] ?? 0;
            const h = (v / 255) * H;
            ctx2d.fillRect(x, H - h, 1, h);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <Section title="Spectrum">
      <p className="text-xs text-stone-300 mb-2">
        Log-frequency, ~30 Hz to Nyquist. White ~ flat; pink slopes down ~3 dB/oct;
        brown slopes down ~6 dB/oct; tinnitus mask shows a peak.
      </p>
      <canvas
        ref={canvasRef}
        width={360}
        height={90}
        className="w-full rounded-soft bg-ink-800"
      />
    </Section>
  );
}

function NoiseSection() {
  const engine = useMemo(() => getAudioEngine(), []);
  const [color, setColor] = useState<NoiseColor>('pink');
  const [volume, setVolume] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const layerRef = useRef<NoiseGenerator | null>(null);

  const ensureLayer = () => {
    if (!layerRef.current) {
      const layer = new NoiseGenerator(engine, {
        id: 'synth-bed',
        color,
        defaultVolume: volume,
      });
      engine.addLayer(layer);
      layerRef.current = layer;
    }
    return layerRef.current;
  };

  return (
    <Section title="Synth bed (white / pink / brown)">
      <div className="flex gap-2 mb-4">
        {(['white', 'pink', 'brown'] as const).map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c);
              layerRef.current?.setColor(c);
            }}
            className={
              'px-3 py-1 rounded-soft text-sm transition-all duration-slow ease-exhale ' +
              (color === c ? 'bg-moon-500 text-ink-950' : 'bg-ink-800 text-stone-200')
            }
          >
            {c}
          </button>
        ))}
      </div>
      <Slider
        label={'Volume -- ' + Math.round(volume * 100) + '%'}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          layerRef.current?.setVolume(v);
        }}
      />
      <div className="mt-3">
        <PlayPause
          playing={playing}
          onPlay={async () => {
            await engine.unlock();
            await engine.loadNoiseWorklet();
            const layer = ensureLayer();
            layer.start();
            setPlaying(true);
          }}
          onStop={() => {
            if (layerRef.current) {
              void engine.removeLayer(layerRef.current.id);
              layerRef.current = null;
            }
            setPlaying(false);
          }}
        />
      </div>
    </Section>
  );
}

function ToneMatcherSection({
  initialHz,
  onSave,
}: {
  initialHz: number;
  onSave: (hz: number, bandwidthHz: number) => void;
}) {
  const engine = useMemo(() => getAudioEngine(), []);
  const matcherRef = useRef<ToneMatcher | null>(null);
  const [sliderPos, setSliderPos] = useState(ToneMatcher.hzToSlider(initialHz));
  const [bandwidth, setBandwidth] = useState(400);
  const [playing, setPlaying] = useState(false);

  const hz = ToneMatcher.sliderToHz(sliderPos);

  return (
    <Section title="Tinnitus tone matcher">
      <p className="text-xs text-stone-300 mb-3">
        Slide until the tone matches your tinnitus. Logarithmic scale, 2 kHz to 12 kHz.
      </p>
      <Slider
        label={'Frequency -- ' + Math.round(hz) + ' Hz'}
        value={sliderPos}
        onChange={(v) => {
          setSliderPos(v);
          if (matcherRef.current) {
            matcherRef.current.setFrequency(ToneMatcher.sliderToHz(v));
          }
        }}
      />
      <div className="mt-2">
        <Slider
          label={'Bandwidth -- ' + Math.round(bandwidth / 2) + ' Hz each side'}
          value={(bandwidth - 50) / (1000 - 50)}
          onChange={(v) => setBandwidth(50 + v * (1000 - 50))}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={async () => {
            if (playing) {
              await matcherRef.current?.stop();
              setPlaying(false);
            } else {
              await engine.unlock();
              if (!matcherRef.current) {
                matcherRef.current = new ToneMatcher(engine.context, engine.bus.input);
                matcherRef.current.setFrequency(hz);
                matcherRef.current.setVolume(0.08);
              }
              matcherRef.current.start();
              setPlaying(true);
            }
          }}
          className="px-3 py-1 rounded-soft text-sm bg-ink-800 text-stone-100"
        >
          {playing ? 'Stop tone' : 'Play tone'}
        </button>
        <button
          onClick={() => onSave(hz, bandwidth)}
          className="px-3 py-1 rounded-soft text-sm bg-moon-500 text-ink-950"
        >
          Save
        </button>
      </div>
    </Section>
  );
}

function TinnitusMaskSection({
  centerHz,
  bandwidthHz,
}: {
  centerHz: number;
  bandwidthHz: number;
}) {
  const engine = useMemo(() => getAudioEngine(), []);
  const layerRef = useRef<TinnitusMaskLayer | null>(null);
  const [volume, setVolume] = useState(0.2);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    layerRef.current?.setCenterFrequency(centerHz);
    layerRef.current?.setBandwidth(bandwidthHz);
  }, [centerHz, bandwidthHz]);

  return (
    <Section title="Tinnitus masking layer">
      <p className="text-xs text-stone-300 mb-3">
        Band-passed white noise at {Math.round(centerHz)} Hz, +/-
        {' '}{Math.round(bandwidthHz / 2)} Hz.
      </p>
      <Slider
        label={'Volume -- ' + Math.round(volume * 100) + '%'}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          layerRef.current?.setVolume(v);
        }}
      />
      <div className="mt-3">
        <PlayPause
          playing={playing}
          onPlay={async () => {
            await engine.unlock();
            await engine.loadNoiseWorklet();
            if (!layerRef.current) {
              const layer = new TinnitusMaskLayer(engine, {
                centerHz,
                bandwidthHz,
                defaultVolume: volume,
              });
              engine.addLayer(layer);
              layerRef.current = layer;
            }
            layerRef.current.start();
            setPlaying(true);
          }}
          onStop={() => {
            if (layerRef.current) {
              void engine.removeLayer(layerRef.current.id);
              layerRef.current = null;
            }
            setPlaying(false);
          }}
        />
      </div>
    </Section>
  );
}

function CrossfadeSection() {
  const engine = useMemo(() => getAudioEngine(), []);
  const layerRef = useRef<FileLayer | null>(null);
  const [volume, setVolume] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [building, setBuilding] = useState(false);

  return (
    <Section title="Seamless crossfade -- synthesized test pad">
      <p className="text-xs text-stone-300 mb-3">
        Two synthesized test tones run through a FileLayer with a 5-second
        equal-power crossfade and 12-second loop offset. There should be no
        loop seam.
      </p>
      <Slider
        label={'Volume -- ' + Math.round(volume * 100) + '%'}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          layerRef.current?.setVolume(v);
        }}
      />
      <div className="mt-3">
        <PlayPause
          playing={playing}
          disabled={building}
          onPlay={async () => {
            setBuilding(true);
            try {
              await engine.unlock();
              if (!layerRef.current) {
                const ctx = engine.context;
                const variants = [
                  {
                    id: 'pad-220',
                    buffer: generateTestPadBuffer(ctx, 18, 220),
                    loopOffsetSeconds: 12,
                  },
                  {
                    id: 'pad-261',
                    buffer: generateTestPadBuffer(ctx, 18, 261),
                    loopOffsetSeconds: 12,
                  },
                ];
                const layer = new FileLayer(engine, {
                  id: 'crossfade-demo',
                  label: 'Crossfade test',
                  variants,
                  crossfadeSeconds: 5,
                  defaultVolume: volume,
                  variantRotation: 'sequential',
                });
                engine.addLayer(layer);
                layerRef.current = layer;
              }
              layerRef.current.start();
              setPlaying(true);
            } finally {
              setBuilding(false);
            }
          }}
          onStop={() => {
            if (layerRef.current) {
              void engine.removeLayer(layerRef.current.id);
              layerRef.current = null;
            }
            setPlaying(false);
          }}
        />
      </div>
    </Section>
  );
}

function ScenesSection({
  tinnitusCenterHz,
  tinnitusBandwidthHz,
}: {
  tinnitusCenterHz: number;
  tinnitusBandwidthHz: number;
}) {
  const engine = useMemo(() => getAudioEngine(), []);
  const coordinator = useMemo(() => getSceneCoordinator(engine), [engine]);

  const [index, setIndex] = useState<SceneIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [loadingSceneId, setLoadingSceneId] = useState<string | null>(null);
  const [variantOutcomes, setVariantOutcomes] = useState<VariantLoadOutcome[]>([]);
  const [layerSummary, setLayerSummary] = useState<LayerSummary[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!activeSceneId) return;
    const interval = setInterval(() => {
      const scene = coordinator.getCurrentScene();
      if (scene) setLayerSummary(summarizeScene(scene));
    }, 250);
    return () => clearInterval(interval);
  }, [activeSceneId, coordinator]);

  useEffect(() => {
    let cancelled = false;
    fetchSceneIndex()
      .then((idx) => {
        if (!cancelled) setIndex(idx);
      })
      .catch((err) => {
        if (!cancelled) setIndexError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStart = useCallback(
    async (entry: SceneIndexEntry) => {
      setLoadingSceneId(entry.id);
      setVariantOutcomes([]);
      try {
        await engine.unlock();
        const def = await fetchSceneDefinition(entry);
        const collected: VariantLoadOutcome[] = [];
        const scene = await coordinator.startScene(def, {
          tinnitus: {
            centerHz: tinnitusCenterHz,
            bandwidthHz: tinnitusBandwidthHz,
          },
          fallbackToSynthetic: true,
          onVariantLoaded: (info) => collected.push(info),
          fadeSeconds: DEFAULT_SCENE_CROSSFADE_SECONDS,
          firstFadeSeconds: DEFAULT_SCENE_FIRST_START_SECONDS,
        });
        setVariantOutcomes(collected);
        setActiveSceneId(scene.id);
        setLayerSummary(summarizeScene(scene));
      } catch (err) {
        console.error('[ScenesSection] start failed:', err);
        setVariantOutcomes([
          {
            elementId: '(scene)',
            variantId: '(load)',
            url: entry.url,
            status: 'failed',
            error: err,
          },
        ]);
      } finally {
        setLoadingSceneId(null);
      }
    },
    [engine, coordinator, tinnitusCenterHz, tinnitusBandwidthHz]
  );

  const handleStop = useCallback(() => {
    coordinator.stopScene(DEFAULT_SCENE_FIRST_START_SECONDS);
    setActiveSceneId(null);
    setLayerSummary([]);
  }, [coordinator]);

  const handleSurpriseMe = useCallback(() => {
    if (!index || index.scenes.length === 0) return;
    const choices = index.scenes.filter((s) => s.id !== activeSceneId);
    const pool = choices.length > 0 ? choices : index.scenes;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) void handleStart(pick);
  }, [index, activeSceneId, handleStart]);

  const fallbackCount = variantOutcomes.filter(
    (o) => o.status === 'fallback-synthetic'
  ).length;
  const failedCount = variantOutcomes.filter((o) => o.status === 'failed').length;

  return (
    <Section title="Scenes (Phase 2)">
      <p className="text-xs text-stone-300 mb-3">
        Multi-layer scenes with an 8-second cross-scene fade. Audio files
        are placeholders; missing files fall back to a synthesized pad so
        the engine works before George Vlad recordings land in
        <code className="text-moon-300"> /public/audio/</code>.
      </p>

      {indexError && (
        <p className="text-ember-400 text-xs mb-3">Index error: {indexError}</p>
      )}

      <div className="flex gap-2 flex-wrap mb-3">
        {index?.scenes.map((entry) => {
          const isActive = entry.id === activeSceneId;
          const isLoading = entry.id === loadingSceneId;
          return (
            <button
              key={entry.id}
              disabled={isLoading}
              onClick={() => handleStart(entry)}
              className={
                'px-3 py-1 rounded-soft text-sm transition-all duration-slow ease-exhale ' +
                (isActive ? 'bg-moon-500 text-ink-950' : 'bg-ink-800 text-stone-200') +
                ' disabled:opacity-50'
              }
            >
              {isLoading ? 'Loading…' : entry.label}
            </button>
          );
        })}
        {activeSceneId && (
          <button
            onClick={handleStop}
            className="px-3 py-1 rounded-soft text-sm bg-ember-500 text-ink-950"
          >
            Stop
          </button>
        )}
        {index && index.scenes.length > 1 && (
          <button
            onClick={handleSurpriseMe}
            disabled={loadingSceneId !== null}
            className="px-3 py-1 rounded-soft text-sm bg-ink-700 text-stone-100 disabled:opacity-50"
            title="Pick a random scene (skips the current one)"
          >
            Surprise me
          </button>
        )}
      </div>

      {variantOutcomes.length > 0 && (
        <p className="text-xs text-stone-400 mb-3">
          Variants loaded: {variantOutcomes.length - fallbackCount - failedCount}
          {fallbackCount > 0 && (
            <span className="text-moon-300">
              {' '}
              · {fallbackCount} synthesized fallback
              {fallbackCount === 1 ? '' : 's'}
            </span>
          )}
          {failedCount > 0 && (
            <span className="text-ember-400">
              {' '}
              · {failedCount} failed
            </span>
          )}
        </p>
      )}

      {layerSummary.length > 0 && (
        <div className="space-y-3 bg-ink-800 rounded-soft p-3">
          {layerSummary.map((row) => (
            <div key={row.id}>
              <Slider
                label={`${row.label} — ${Math.round(row.volume * 100)}%`}
                value={row.volume}
                onChange={(v) => {
                  const scene = coordinator.getCurrentScene();
                  if (!scene) return;
                  scene.setLayerVolume(row.id, v);
                  setTick((t) => t + 1);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

interface LayerSummary {
  id: string;
  label: string;
  volume: number;
}

function summarizeScene(scene: Scene): LayerSummary[] {
  return scene.getLayers().map((layer) => ({
    id: layer.id,
    label: layer.label,
    volume: layer.getVolume(),
  }));
}

function MasterSection({
  initialVolume,
  onChange,
}: {
  initialVolume: number;
  onChange: (v: number) => void;
}) {
  const engine = useMemo(() => getAudioEngine(), []);
  const [volume, setVolume] = useState(initialVolume);

  useEffect(() => {
    if (engine.isInitialized) engine.bus.setMasterVolume(initialVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Section title="Master">
      <Slider
        label={'Master -- ' + Math.round(volume * 100) + '%'}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          if (engine.isInitialized) engine.bus.setMasterVolume(v);
          onChange(v);
        }}
      />
      <div className="mt-3 flex gap-2 flex-wrap">
        <button
          onClick={() => engine.isInitialized && engine.bus.fadeToSilence(10)}
          className="px-3 py-1 rounded-soft text-sm bg-ink-800 text-stone-200"
          title="Demo of the timer fade -- exponential to silence over 10s"
        >
          Fade out (10s)
        </button>
        <button
          onClick={() => engine.isInitialized && engine.bus.cancelFade(volume, 1)}
          className="px-3 py-1 rounded-soft text-sm bg-ink-800 text-stone-200"
        >
          Cancel fade
        </button>
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-stone-50 text-xl mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-stone-300 mb-1">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-valuetext={`${Math.round(value * 100)} percent`}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

function PlayPause({
  playing,
  onPlay,
  onStop,
  disabled,
}: {
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => (playing ? onStop() : onPlay())}
      className={
        'px-4 py-2 rounded-soft text-sm transition-all duration-slow ease-exhale ' +
        (playing ? 'bg-ember-500 text-ink-950' : 'bg-moon-500 text-ink-950') +
        ' disabled:opacity-50'
      }
    >
      {playing ? 'Stop' : 'Play'}
    </button>
  );
}
