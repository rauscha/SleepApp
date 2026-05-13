// Player — what you stare at while falling asleep.
//
// Brief §7: "very dim chrome, big 44px+ play/pause." Timer chip sits in
// the header: tap to cycle through durations (15/30/60/90 min or off).
// When the countdown reaches zero, MasterBus.fadeToSilence() fires over
// TIMER_FADE_SECONDS, then the scene stops and the app returns to Tonight.
//
// The user can still tap Stop manually during a timer fade — the fade
// completion callback is cancelled and the normal stop path runs instead.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine';
import {
  DEFAULT_SCENE_FIRST_START_SECONDS,
  getSceneCoordinator,
} from '../audio/SceneCoordinator';
import type { Scene } from '../audio/Scene';
import { getSetting, setSetting } from '../storage';

const TIMER_OPTIONS_MINUTES = [15, 30, 60, 90] as const;
/** How long MasterBus fades to silence when the timer fires. */
const TIMER_FADE_SECONDS = 90;

type TimerMode =
  | { status: 'off' }
  | { status: 'picking' }
  | { status: 'running'; endsAt: number }
  | { status: 'fading' };

function formatMs(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export interface PlayerScreenProps {
  onExit: () => void;
}

export function PlayerScreen({ onExit }: PlayerScreenProps) {
  const engine = useMemo(() => getAudioEngine(), []);
  const coordinator = useMemo(() => getSceneCoordinator(engine), [engine]);

  const [scene, setScene] = useState<Scene | null>(() =>
    coordinator.getCurrentScene()
  );
  const [mixerOpen, setMixerOpen] = useState(false);
  const [masterVolume, setMasterVolume] = useState<number>(
    () => getSetting('masterVolume')
  );
  const [, setTick] = useState(0);

  // --- Timer state ---
  const [timer, setTimer] = useState<TimerMode>({ status: 'off' });
  const [remaining, setRemaining] = useState(0);
  // Holds the timeout ID for the post-fade stop+exit call so we can
  // cancel it if the user taps Stop manually during a fade.
  const fadeExitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    engine.bus.setMasterVolume(masterVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync scene state via polling (simple; avoids an event-channel build).
  useEffect(() => {
    const id = setInterval(() => {
      const current = coordinator.getCurrentScene();
      setScene(current);
      if (current) setTick((t) => t + 1);
    }, 500);
    return () => clearInterval(id);
  }, [coordinator]);

  // Countdown tick — runs only while timer is 'running'.
  useEffect(() => {
    if (timer.status !== 'running') return;
    setRemaining(timer.endsAt - Date.now());
    const id = setInterval(() => {
      const ms = timer.endsAt - Date.now();
      if (ms <= 0) {
        // Countdown hit zero — kick the bus fade, then stop the scene.
        setTimer({ status: 'fading' });
        engine.bus.fadeToSilence(TIMER_FADE_SECONDS);
        fadeExitTimer.current = setTimeout(() => {
          fadeExitTimer.current = null;
          coordinator.stopScene(DEFAULT_SCENE_FIRST_START_SECONDS);
          onExit();
        }, (TIMER_FADE_SECONDS + 0.6) * 1000);
      } else {
        setRemaining(ms);
      }
    }, 500);
    return () => clearInterval(id);
  }, [timer, engine, coordinator, onExit]);

  const handleStop = useCallback(() => {
    // Cancel any pending fade-completion timer.
    if (fadeExitTimer.current) {
      clearTimeout(fadeExitTimer.current);
      fadeExitTimer.current = null;
    }
    // If we were fading the bus, restore volume so the next session starts
    // at a normal level.
    if (timer.status === 'fading') {
      engine.bus.cancelFade(masterVolume, 0.1);
    }
    setTimer({ status: 'off' });
    coordinator.stopScene(DEFAULT_SCENE_FIRST_START_SECONDS);
    setScene(null);
    onExit();
  }, [coordinator, engine, timer, masterVolume, onExit]);

  const startTimer = useCallback((minutes: number) => {
    setTimer({ status: 'running', endsAt: Date.now() + minutes * 60_000 });
  }, []);

  const cancelTimer = useCallback(() => {
    if (fadeExitTimer.current) {
      clearTimeout(fadeExitTimer.current);
      fadeExitTimer.current = null;
    }
    // If the bus was already fading, restore volume.
    if (timer.status === 'fading') {
      engine.bus.cancelFade(masterVolume, 1);
    }
    setTimer({ status: 'off' });
  }, [timer, engine, masterVolume]);

  // Empty state — should rarely render; the router only mounts us after
  // a scene starts, but a cold navigation or HMR can leave this blank.
  if (!scene) {
    return (
      <div className="min-h-screen bg-ink-950 text-stone-100 flex items-center justify-center px-8">
        <div className="text-center">
          <h1 className="font-serif text-stone-50 text-2xl mb-4">
            Nothing playing yet.
          </h1>
          <button
            onClick={onExit}
            className="px-5 py-2 rounded-soft bg-moon-500 text-ink-950 text-sm"
          >
            Pick a scene
          </button>
        </div>
      </div>
    );
  }

  const layers = scene.getLayers();

  return (
    <div className="min-h-screen bg-ink-950 text-stone-100 flex flex-col px-6 py-8 max-w-md mx-auto">
      <header className="mb-10">
        {/* Nav row */}
        <div className="flex items-center justify-between mb-7">
          <button
            onClick={onExit}
            className="text-xs text-stone-400 hover:text-stone-200 transition-colors duration-slow"
            aria-label="Back to scenes"
          >
            ← Scenes
          </button>
          <TimerChip
            timer={timer}
            remaining={remaining}
            onTap={() => {
              if (timer.status === 'off') setTimer({ status: 'picking' });
              else if (timer.status === 'picking') setTimer({ status: 'off' });
              else cancelTimer();
            }}
          />
        </div>

        {/* Duration picker — inline, appears below nav row when picking */}
        {timer.status === 'picking' && (
          <div className="flex gap-2 justify-end mb-5">
            {TIMER_OPTIONS_MINUTES.map((m) => (
              <button
                key={m}
                onClick={() => startTimer(m)}
                className="px-3 py-1 rounded-soft text-xs text-stone-200
                           bg-ink-700 hover:bg-ink-600 active:bg-moon-700
                           transition-colors duration-slow"
              >
                {m} min
              </button>
            ))}
          </div>
        )}

        <h1 className="font-serif text-stone-50 text-3xl leading-tight">
          {scene.definition.label}
        </h1>
        <p className="text-stone-400 text-sm mt-1">
          {timer.status === 'fading'
            ? 'Fading out…'
            : timer.status === 'running'
            ? `Stops in ${formatMs(remaining)}`
            : 'Playing'}
        </p>
      </header>

      {/* Stop button */}
      <div className="flex-1 flex flex-col justify-center items-center mb-8">
        <button
          onClick={handleStop}
          className="w-32 h-32 rounded-full bg-ember-500 text-ink-950 font-serif text-xl
                     transition-all duration-slow ease-exhale
                     active:scale-95 active:bg-ember-400
                     shadow-ambient"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="Stop scene"
        >
          Stop
        </button>
        <p className="text-stone-400 text-xs mt-4 max-w-xs text-center">
          {timer.status === 'fading'
            ? `${TIMER_FADE_SECONDS}s fade. Walk away.`
            : '8-second fade. Tap Stop and walk away.'}
        </p>
      </div>

      {/* Master volume */}
      <div className="mb-6">
        <label className="block">
          <span className="block text-xs text-stone-400 mb-2">
            Master volume — {Math.round(masterVolume * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            aria-label="Master volume"
            aria-valuetext={`${Math.round(masterVolume * 100)} percent`}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setMasterVolume(v);
              engine.bus.setMasterVolume(v);
              setSetting('masterVolume', v);
            }}
          />
        </label>
      </div>

      {/* Mixer drawer */}
      <div>
        <button
          onClick={() => setMixerOpen((open) => !open)}
          className="w-full flex justify-between items-center px-3 py-2 text-xs
                     text-stone-300 hover:text-stone-100 transition-colors duration-slow"
        >
          <span>Mixer</span>
          <span>{mixerOpen ? '▾' : '▸'}</span>
        </button>
        {mixerOpen && (
          <div className="space-y-3 bg-ink-800 rounded-soft p-3 mt-2">
            {layers.map((layer) => (
              <LayerSlider
                key={layer.id}
                label={layer.label}
                value={layer.getVolume()}
                onChange={(v) => {
                  scene.setLayerVolume(layer.id, v);
                  setTick((t) => t + 1);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimerChip({
  timer,
  remaining,
  onTap,
}: {
  timer: TimerMode;
  remaining: number;
  onTap: () => void;
}) {
  let label: string;
  let accent: string;

  if (timer.status === 'running') {
    label = formatMs(remaining);
    accent = 'text-moon-300';
  } else if (timer.status === 'fading') {
    label = 'Fading…';
    accent = 'text-stone-400 italic';
  } else if (timer.status === 'picking') {
    label = 'Timer ×';
    accent = 'text-stone-300';
  } else {
    label = 'Timer';
    accent = 'text-stone-500';
  }

  return (
    <button
      onClick={onTap}
      aria-label={
        timer.status === 'running'
          ? `Cancel timer (${formatMs(remaining)} remaining)`
          : timer.status === 'fading'
          ? 'Cancel timer fade'
          : 'Set sleep timer'
      }
      className={`text-xs transition-colors duration-slow ${accent}
                  hover:text-stone-200 active:text-moon-300 px-1 py-1`}
    >
      {label}
    </button>
  );
}

function LayerSlider({
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
      <span className="block text-xs text-stone-300 mb-1">
        {label} — {Math.round(value * 100)}%
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={label}
        aria-valuetext={`${Math.round(value * 100)} percent`}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}
