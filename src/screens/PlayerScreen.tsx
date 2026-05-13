// Player — what you stare at while falling asleep.
//
// Brief §7: "very dim chrome, big 44px+ play/pause." This screen is the
// minimum viable version of that: scene title, master volume, big stop
// button, collapsible per-layer mixer.
//
// We deliberately do NOT auto-detect "no scene playing" and redirect away
// — we trust the parent App router to only mount us when a scene exists.
// If a scene IS in-flight when we mount (e.g. HMR mid-session), we re-sync
// to it.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine';
import {
  DEFAULT_SCENE_FIRST_START_SECONDS,
  getSceneCoordinator,
} from '../audio/SceneCoordinator';
import type { Scene } from '../audio/Scene';
import { getSetting, setSetting } from '../storage';

export interface PlayerScreenProps {
  /** Called when the user explicitly stops or backs out of the player. */
  onExit: () => void;
}

export function PlayerScreen({ onExit }: PlayerScreenProps) {
  const engine = useMemo(() => getAudioEngine(), []);
  const coordinator = useMemo(() => getSceneCoordinator(engine), [engine]);

  // We mirror coordinator.getCurrentScene() into local state so render
  // cycles stay predictable. Polled every 500ms — cheap and avoids
  // wiring an event channel through the coordinator just for the UI.
  const [scene, setScene] = useState<Scene | null>(() =>
    coordinator.getCurrentScene()
  );
  const [mixerOpen, setMixerOpen] = useState(false);
  const [masterVolume, setMasterVolume] = useState<number>(
    () => getSetting('masterVolume')
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    engine.bus.setMasterVolume(masterVolume);
    // Master volume only needs to push on mount + when user moves the
    // slider; the slider handler does its own push too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const current = coordinator.getCurrentScene();
      setScene(current);
      if (current) setTick((t) => t + 1);
    }, 500);
    return () => clearInterval(id);
  }, [coordinator]);

  const handleStop = useCallback(() => {
    coordinator.stopScene(DEFAULT_SCENE_FIRST_START_SECONDS);
    setScene(null);
    onExit();
  }, [coordinator, onExit]);

  // Empty state — shouldn't normally render because the router only
  // mounts us when a scene exists, but a defensive fallback keeps us
  // useful if the user navigates here cold somehow.
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

  const sceneLabel = scene.definition.label;
  const layers = scene.getLayers();

  return (
    <div className="min-h-screen bg-ink-950 text-stone-100 flex flex-col px-6 py-8 max-w-md mx-auto">
      <header className="mb-12">
        <button
          onClick={onExit}
          className="text-xs text-stone-400 hover:text-stone-200 transition-colors duration-slow mb-8"
          aria-label="Back to scenes"
        >
          ← Scenes
        </button>
        <h1 className="font-serif text-stone-50 text-3xl leading-tight">
          {sceneLabel}
        </h1>
        <p className="text-stone-400 text-sm mt-2">Playing</p>
      </header>

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
          8-second fade. Tap Stop and walk away.
        </p>
      </div>

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
