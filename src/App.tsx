import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { SettingsScreen } from './screens/SettingsScreen';

// App is a thin three-way router between the Phase 3 screens and the
// Phase 1 dev harness. The harness stays reachable from Tonight via a
// discrete "Dev tools" link — useful for spectrum inspection, the
// crossfade demo, and the noise generators that aren't in the Player.

type Screen = 'tonight' | 'player' | 'harness' | 'settings';
const SCREEN_KEY = 'sleep-app:current-screen:v1';

function loadInitialScreen(): Screen {
  try {
    const v = localStorage.getItem(SCREEN_KEY);
    if (v === 'tonight' || v === 'player' || v === 'harness' || v === 'settings') return v;
  } catch {
    /* localStorage unavailable (private mode etc.) — fall through */
  }
  return 'tonight';
}

// Tinnitus matcher + mask harness UI is shelved (see comment in Harness'
// JSX). Flip to true to bring it back; the engine classes never went away.
const SHOW_TINNITUS_HARNESS = false;

export function App() {
  const engine = useMemo(() => getAudioEngine(), []);
  // If the engine is already up (singleton survived an HMR), skip the
  // unlock gate — there's no second user gesture required and asking
  // for one would lose the AudioContext we already have.
  const [unlocked, setUnlocked] = useState(
    () => engine.isInitialized && engine.isWorkletReady
  );
  const [screen, setScreen] = useState<Screen>(loadInitialScreen);

  useEffect(() => {
    try {
      localStorage.setItem(SCREEN_KEY, screen);
    } catch {
      /* noop */
    }
  }, [screen]);

  if (!unlocked) {
    return (
      <UnlockGate
        onUnlock={async () => {
          await engine.unlock();
          await engine.loadNoiseWorklet();
          setUnlocked(true);
        }}
      />
    );
  }

  if (screen === 'tonight') {
    return (
      <TonightScreen
        onPlaybackStarted={() => setScreen('player')}
        onSettingsRequested={() => setScreen('settings')}
        onDevToolsRequested={() => setScreen('harness')}
      />
    );
  }
  if (screen === 'player') {
    return <PlayerScreen onExit={() => setScreen('tonight')} />;
  }
  if (screen === 'settings') {
    return <SettingsScreen onBack={() => setScreen('tonight')} />;
  }
  return <Harness onBackToTonight={() => setScreen('tonight')} />;
}

// Harness — the original Phase-1 dev surface, now reached via the Dev
// tools link from Tonight. Exposes every engine feature individually so
// regressions surface visually.
function Harness({ onBackToTonight }: { onBackToTonight: () => void }) {
  const engine = useMemo(() => getAudioEngine(), []);
  // Settings is read-only here; the only mutating consumer (tinnitus
  // matcher save) is currently shelved. MasterSection mutates settings
  // through setSetting directly, not via this state.
  const [settings] = useState(() => getAllSettings());
  const [contextState, setContextState] = useState(engine.state);

  useEffect(() => {
    const unsub = engine.addListener((e) => {
      if (e.kind === 'state') setContextState(e.state);
    });
    return unsub;
  }, [engine]);

  return (
    <div className="min-h-screen bg-ink-950 text-stone-100 px-6 py-8 max-w-md mx-auto">
      <header className="mb-8 flex justify-between items-start gap-4">
        <div>
          <h1 className="text-stone-50 font-serif text-3xl">Engine harness</h1>
          <p className="text-stone-300 text-sm mt-1">
            Dev surface. AudioContext: {contextState}
          </p>
        </div>
        <button
          onClick={onBackToTonight}
          className="text-xs text-stone-400 hover:text-stone-200 transition-colors duration-slow shrink-0 mt-2"
        >
          ← Tonight
        </button>
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
      {/*
        Tinnitus matcher + mask shelved — evidence for tinnitus masking as a
        sleep aid is weak, and the in-app experience needs work (broader
        surround noise, lower default volume, and a high-tone artefact heard
        even when the layer is "off" that needs root-cause analysis). The
        engine classes (ToneMatcher, TinnitusMaskLayer) and the stored user
        settings remain in place. To revive the harness UI: flip
        SHOW_TINNITUS_HARNESS to true.

        Scene definitions all have `tinnitus.enabledByDefault: false`, so
        scenes will not spin up a TinnitusMaskLayer unless the user opts in
        explicitly through a future settings flow.
      */}
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

function UnlockGate({ onUnlock }: { onUnlock: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="min-h-screen flex items-center justify-center px-8 bg-ink-950">
      <div className="text-center max-w-md">
        <h1 className="font-serif text-stone-50 text-4xl mb-3">Ready to wind down?</h1>
        <p className="text-stone-300 text-base mb-8 max-w-xs mx-auto">
          Tap to begin. The audio engine wakes up here.
        </p>
        <button
          className="px-7 py-3 rounded-soft bg-moon-500 text-ink-950 font-medium transition-all duration-slow ease-exhale active:bg-moon-400 disabled:opacity-50"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onUnlock();
            } catch (err) {
              const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
              console.error('[UnlockGate] unlock failed:', err);
              setError(message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Waking up...' : 'Begin'}
        </button>
        {error && (
          <p className="mt-6 text-xs text-ember-400 break-words text-left bg-ink-800 p-3 rounded-soft">
            <strong>Unlock failed:</strong> {error}
          </p>
        )}
      </div>
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
          onPlay={() => {
            const layer = ensureLayer();
            layer.start();
            setPlaying(true);
          }}
          onStop={() => {
            if (layerRef.current) {
              // Fire-and-forget: removeLayer unregisters synchronously and
              // fades + disposes in the background. UI flips to Stopped
              // immediately; audio tail completes in 0.2–5s depending on
              // the layer.
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
          onPlay={() => {
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
              // Fire-and-forget: removeLayer unregisters synchronously and
              // fades + disposes in the background. UI flips to Stopped
              // immediately; audio tail completes in 0.2–5s depending on
              // the layer.
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
              // Fire-and-forget: removeLayer unregisters synchronously and
              // fades + disposes in the background. UI flips to Stopped
              // immediately; audio tail completes in 0.2–5s depending on
              // the layer.
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
  // Refresh tick to re-render layer summary as the user moves sliders.
  const [, setTick] = useState(0);

  // Refresh layer summary every 250ms while a scene is live so per-layer
  // volume sliders stay in sync if any other code path moves them.
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
    [coordinator, tinnitusCenterHz, tinnitusBandwidthHz]
  );

  const handleStop = useCallback(() => {
    coordinator.stopScene(DEFAULT_SCENE_FIRST_START_SECONDS);
    setActiveSceneId(null);
    setLayerSummary([]);
  }, [coordinator]);

  // Surprise Me — pick a random scene that isn't currently playing, then
  // route through handleStart (which cross-fades when a scene is live and
  // first-fades when not). If there's only one scene available, just play
  // it; if it's already the active scene, no-op (no point cross-fading to
  // self).
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
    engine.bus.setMasterVolume(initialVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Section title="Master">
      <Slider
        label={'Master -- ' + Math.round(volume * 100) + '%'}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          engine.bus.setMasterVolume(v);
          onChange(v);
        }}
      />
      <div className="mt-3 flex gap-2 flex-wrap">
        <button
          onClick={() => engine.bus.fadeToSilence(10)}
          className="px-3 py-1 rounded-soft text-sm bg-ink-800 text-stone-200"
          title="Demo of the timer fade -- exponential to silence over 10s"
        >
          Fade out (10s)
        </button>
        <button
          onClick={() => engine.bus.cancelFade(volume, 1)}
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
