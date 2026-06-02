// Player — what you stare at while falling asleep.
//
// Two display modes:
//   Lush      — the full player UI (default).
//   Nightstand — pure black screen, tap anywhere to reveal dim controls
//                for WAKE_DURATION_MS. Auto-engages after IDLE_TIMEOUT_MS
//                of no interaction; also reachable via the "Nightstand"
//                button at the bottom of the Lush layout.
//
// Sleep timer chip: tap in top-right → pick 15/30/60/90 min → countdown.
// When countdown hits zero, MasterBus.fadeToSilence(90s) runs, then scene
// stops and the app returns to Tonight. Manual Stop cancels the fade.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine';
import {
  DEFAULT_SCENE_FIRST_START_SECONDS,
  getSceneCoordinator,
} from '../audio/SceneCoordinator';
import type { Scene } from '../audio/Scene';
import {
  clearMediaSession,
  setMediaSessionForScene,
} from '../audio/mediaSession';
import { recordEvent } from '../diagnostics/lifecycleLog';
import { useWakeLock } from '../hooks/useWakeLock';
import { scenePlayerBackground } from '../lib/sceneBackground';
import { startSwKeepAlive, stopSwKeepAlive } from '../serviceWorker/keepAlive';
import { getSetting, setSetting } from '../storage';
import { exitFullscreenSafe, requestFullscreenSafe } from '../utils/fullscreen';

// ---------------------------------------------------------------------------
// Constants

const IDLE_TIMEOUT_MS = 30_000;  // inactivity before auto-nightstand
const WAKE_DURATION_MS = 3_000;  // how long a tap reveals controls

const TIMER_OPTIONS_MINUTES = [15, 30, 60, 90] as const;
const TIMER_FADE_SECONDS = 90;   // MasterBus fade duration when timer fires

// ---------------------------------------------------------------------------
// Types

type DisplayMode = 'lush' | 'nightstand';

type TimerMode =
  | { status: 'off' }
  | { status: 'picking' }
  | { status: 'running'; endsAt: number }
  | { status: 'fading' };

// ---------------------------------------------------------------------------
// Helpers

function formatMs(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Hooks

/**
 * Returns true after `timeoutMs` of no user activity on `window`.
 * Only tracks activity when `active` is true — pass false to pause it
 * (e.g. while in Nightstand mode where we don't want the timer to reset
 * on the taps that wake controls).
 */
function useIdleTimer(timeoutMs: number, active: boolean): boolean {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setIsIdle(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsIdle(true), timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    if (!active) {
      setIsIdle(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const events = ['touchstart', 'mousedown', 'mousemove', 'keydown'] as const;
    const handler = () => reset();
    events.forEach((ev) =>
      window.addEventListener(ev, handler, { passive: true })
    );
    reset(); // start the initial countdown
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, reset]);

  return isIdle;
}

/**
 * Returns [awake, wake]. Calling wake() reveals controls for `durationMs`,
 * after which awake flips back to false automatically. Calling wake() again
 * before the timeout resets the countdown.
 */
function useWakeTimer(durationMs: number): [boolean, () => void] {
  const [awake, setAwake] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = useCallback(() => {
    setAwake(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setAwake(false);
    }, durationMs);
  }, [durationMs]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return [awake, wake];
}

// ---------------------------------------------------------------------------
// PlayerScreen

export interface PlayerScreenProps {
  onExit: () => void;
}

export function PlayerScreen({ onExit }: PlayerScreenProps) {
  const engine = useMemo(() => getAudioEngine(), []);
  const coordinator = useMemo(() => getSceneCoordinator(engine), [engine]);

  const [scene, setScene] = useState<Scene | null>(() =>
    coordinator.getCurrentScene()
  );

  // Background keep-alive: silent loop through the AudioContext + screen
  // wake lock. Both engage as soon as a scene is live and disengage when
  // it ends. Wake Lock is no-op on browsers that don't support it; the
  // silent loop is the load-bearing piece for Android's audio focus
  // heuristic.
  useWakeLock(scene !== null);
  useEffect(() => {
    if (!scene) return;
    engine.startKeepAlive();
    startSwKeepAlive();
    recordEvent('keepalive-start');
    return () => {
      engine.stopKeepAlive();
      stopSwKeepAlive();
      recordEvent('keepalive-stop');
    };
  }, [scene, engine]);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [masterVolume, setMasterVolume] = useState<number>(
    () => getSetting('masterVolume')
  );
  const [, setTick] = useState(0);

  // Display mode
  const [displayMode, setDisplayMode] = useState<DisplayMode>('lush');
  const [awake, wake] = useWakeTimer(WAKE_DURATION_MS);
  const isIdle = useIdleTimer(IDLE_TIMEOUT_MS, displayMode === 'lush');

  // Auto-engage Nightstand after idle timeout. Try to go fullscreen as
  // well — this usually fails because the idle path has no recent user
  // gesture, but on browsers that grant fullscreen on "transient
  // activation" persisting through the idle window we get it for free.
  // Either way, the first tap-to-wake in nightstand re-requests it.
  useEffect(() => {
    if (isIdle) {
      setDisplayMode('nightstand');
      requestFullscreenSafe();
    }
  }, [isIdle]);

  // Always release fullscreen when the Player unmounts (back to Tonight,
  // stop button, etc.) — leaving the rest of the app in fullscreen would
  // hide the system bars from the user when they're picking their next
  // scene, which is not what they want.
  useEffect(() => {
    return () => exitFullscreenSafe();
  }, []);

  // AudioContext state-change logging moved into AudioEngine itself so it
  // captures transitions from any screen (including ContentPlayerScreen
  // where the screen-level listener used to be a blind spot). See
  // AudioEngine.ensureContext.

  // Sleep timer — auto-start from the user's default if one is set.
  const [timer, setTimer] = useState<TimerMode>(() => {
    const def = getSetting('defaultTimerMinutes');
    return def !== null
      ? { status: 'running', endsAt: Date.now() + def * 60_000 }
      : { status: 'off' };
  });
  const [remaining, setRemaining] = useState(() => {
    const def = getSetting('defaultTimerMinutes');
    return def !== null ? def * 60_000 : 0;
  });
  const fadeExitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    engine.bus.setMasterVolume(masterVolume);
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

  // Countdown tick
  useEffect(() => {
    if (timer.status !== 'running') return;
    setRemaining(timer.endsAt - Date.now());
    const id = setInterval(() => {
      const ms = timer.endsAt - Date.now();
      if (ms <= 0) {
        setTimer({ status: 'fading' });
        wake(); // surface controls in Nightstand so user sees "Fading…"
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
  }, [timer, engine, coordinator, wake, onExit]);

  const handleStop = useCallback(() => {
    if (fadeExitTimer.current) {
      clearTimeout(fadeExitTimer.current);
      fadeExitTimer.current = null;
    }
    if (timer.status === 'fading') engine.bus.cancelFade(masterVolume, 0.1);
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
    if (timer.status === 'fading') engine.bus.cancelFade(masterVolume, 1);
    setTimer({ status: 'off' });
  }, [timer, engine, masterVolume]);

  // MediaSession + scene-event logging. Tracking the last-seen scene id
  // in a ref lets us distinguish start/switch/stop transitions cleanly
  // from the polled `scene` state.
  const lastSceneIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastSceneIdRef.current;
    const currentId = scene?.definition.id ?? null;
    if (prev === currentId) return;
    if (currentId && scene) {
      recordEvent(prev ? 'scene-switch' : 'scene-start', currentId);
      setMediaSessionForScene(scene.definition.label, {
        onStop: handleStop,
        // Ambient scenes have no real pause/resume semantics — pause is
        // the same intent as stop ("end this scene now"). We wire play so
        // the lock-screen control surface always has both buttons visible
        // (some Android launchers hide the controls entirely if only stop
        // is registered). Play attempts to resume a suspended context;
        // engine.context throws if uninitialized, which it can't be here.
        onPause: handleStop,
        onPlay: () => {
          const ctx = engine.context;
          if (ctx.state === 'suspended') void ctx.resume();
        },
      });
    } else {
      recordEvent('scene-stop', prev ?? '?');
      clearMediaSession();
    }
    lastSceneIdRef.current = currentId;
  }, [scene, handleStop, engine]);

  // Belt-and-suspenders: clear the MediaSession when the Player unmounts
  // for any reason. The effect above already clears on stop, but a hard
  // unmount path (route change, error boundary recovery) skips that.
  useEffect(() => {
    return () => clearMediaSession();
  }, []);

  // No scene loaded — skip the interstitial "nothing playing" screen
  // entirely and send the user straight back to Tonight where they
  // can pick something. The brief asks for the lowest possible friction
  // on the start path; an extra confirmation card breaks that. The
  // bounce happens in an effect so we don't call setState during render.
  useEffect(() => {
    if (!scene) onExit();
  }, [scene, onExit]);
  if (!scene) {
    return <div className="h-full bg-ink-950" aria-hidden="true" />;
  }

  const layers = scene.getLayers();

  return (
    <div
      className="relative min-h-full"
      style={{ background: scenePlayerBackground(scene.definition.id) }}
    >
    <div
      className="text-stone-100 flex flex-col px-6 py-8 max-w-md mx-auto min-h-full"
      aria-hidden={displayMode === 'nightstand'}
    >
      <header className="mb-10">
        <div className="flex items-center justify-between mb-7">
          <button
            onClick={onExit}
            className="ui-label text-stone-400 hover:text-stone-200
                       transition-colors duration-slow px-2 py-2"
            style={{ minHeight: 44, minWidth: 44 }}
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

        {timer.status === 'picking' && (
          <div className="flex gap-2 justify-end mb-5">
            {TIMER_OPTIONS_MINUTES.map((m) => (
              <button
                key={m}
                onClick={() => startTimer(m)}
                className="px-3 py-2 rounded-soft ui-label text-stone-200
                           bg-ink-700 hover:bg-ink-600 active:bg-moon-700
                           transition-colors duration-slow"
                style={{ minHeight: 44, minWidth: 44 }}
              >
                {m} min
              </button>
            ))}
          </div>
        )}

        <h1 className="font-serif text-stone-50 text-3xl leading-tight">
          {scene.definition.label}
        </h1>
        <p className="text-stone-400 body-text mt-1">
          {timer.status === 'fading'
            ? 'Fading out…'
            : timer.status === 'running'
            ? `Stops in ${formatMs(remaining)}`
            : 'Playing'}
        </p>
      </header>

      <div className="flex-1 flex flex-col justify-center items-center mb-8">
        <button
          onClick={handleStop}
          className="w-32 h-32 rounded-full bg-ember-500 text-ink-950 font-serif text-xl
                     transition-all duration-slow ease-exhale
                     active:scale-95 active:bg-ember-400 shadow-ambient"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="Stop scene"
        >
          Stop
        </button>
        <p className="text-stone-400 body-text mt-4 max-w-xs text-center">
          {timer.status === 'fading'
            ? `${TIMER_FADE_SECONDS}s fade. Walk away.`
            : '8-second fade. Tap Stop and walk away.'}
        </p>
      </div>

      <div className="mb-6">
        <label className="block">
          <span className="block body-text text-stone-300 mb-2">
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
          className="w-full flex justify-between items-center px-3 py-3 body-text
                     text-stone-300 hover:text-stone-100 transition-colors duration-slow"
          style={{ minHeight: 44 }}
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

      <div className="mt-8 flex justify-center">
        <button
          onClick={() => {
            // Fullscreen is normally already engaged from the scene-pick
            // in TonightScreen. Re-request anyway: if the user dismissed
            // it via a system gesture we want it back, and this click is
            // a fresh user activation.
            requestFullscreenSafe();
            setDisplayMode('nightstand');
          }}
          className="ui-label text-stone-400 hover:text-stone-200
                     active:text-moon-300 transition-colors duration-slow
                     px-3 py-3"
          style={{ minHeight: 44 }}
        >
          Nightstand mode
        </button>
      </div>
    </div>

      {/* Nightstand black overlay — opacity crossfade hides the scene photo
          when the user goes idle (or taps "Nightstand mode"). Lives in the
          same DOM as Lush so the photo background can be staring-at while
          falling asleep, then the screen smoothly goes flat-black for the
          sleep portion. Pointer-events gated so taps fall through to Lush
          while disengaged. */}
      <NightstandOverlay
        engaged={displayMode === 'nightstand'}
        scene={scene}
        timer={timer}
        remaining={remaining}
        awake={awake}
        onTap={() => {
          // Each wake-tap is a user gesture — opportunistically re-request
          // fullscreen so the status bar disappears even if the auto-engage
          // path could not get it the first time. requestFullscreenSafe is
          // a noop when we're already fullscreen.
          requestFullscreenSafe();
          wake();
        }}
        onStop={handleStop}
        onExitNightstand={() => setDisplayMode('lush')}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// NightstandOverlay
//
// Sibling layer to the Lush UI. When engaged, a near-opaque black field
// crossfades in over the scene-photo background; the overlay's controls
// (scene name, timer status, Stop, Lush button) reveal on tap. When not
// engaged, the overlay is opacity 0 + pointer-events-none, so clicks fall
// through to the Lush content underneath.
//
// Crossfade duration is 1800ms — slow enough to feel like an exhale rather
// than a UI transition, short enough that an intentional Nightstand tap
// doesn't feel laggy.

const NIGHTSTAND_FADE_MS = 1800;

function NightstandOverlay({
  engaged,
  scene,
  timer,
  remaining,
  awake,
  onTap,
  onStop,
  onExitNightstand,
}: {
  engaged: boolean;
  scene: Scene;
  timer: TimerMode;
  remaining: number;
  awake: boolean;
  onTap: () => void;
  onStop: () => void;
  onExitNightstand: () => void;
}) {
  return (
    // Full-viewport black overlay. Opacity tweens between 0 (Lush — clicks
    // pass through to the photo-backed Lush UI underneath) and 1 (Nightstand
    // — flat black, taps wake the inner controls). The bg-photo lives on the
    // Player's outer container, so when this overlay reaches opacity 1 the
    // photo is fully hidden behind it.
    <div
      className={[
        'fixed inset-0 bg-black flex flex-col items-center justify-center cursor-default',
        'transition-opacity ease-exhale',
        engaged ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      ].join(' ')}
      style={{ transitionDuration: `${NIGHTSTAND_FADE_MS}ms` }}
      onClick={engaged ? onTap : undefined}
      role={engaged ? 'main' : undefined}
      aria-label="Nightstand mode — tap anywhere to see controls"
      aria-hidden={!engaged}
    >
      {/* Controls overlay — always in DOM; visibility driven by opacity only
          so the Stop button retains its position and tap area. */}
      <div
        className={[
          'flex flex-col items-center gap-8 px-8 w-full max-w-xs',
          'transition-opacity duration-slow ease-exhale',
          engaged && awake ? 'opacity-40 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        {/* Scene name + timer status. Text labels on the status line are
            paired with colour cues but never depend on colour alone —
            the user is colourblind and won't reliably distinguish
            moon-300 from stone-300 from stone-400. */}
        <div className="text-center">
          <p className="text-stone-300 body-text tracking-wide">
            {scene.definition.label}
          </p>
          {timer.status === 'running' && (
            <p className="text-moon-300 body-text mt-1">
              ▸ {formatMs(remaining)}
            </p>
          )}
          {timer.status === 'fading' && (
            <p className="text-stone-300 body-text mt-1 italic">
              fading…
            </p>
          )}
        </div>

        {/* Stop button */}
        <button
          onClick={(e) => { e.stopPropagation(); onStop(); }}
          className="w-28 h-28 rounded-full bg-ember-500 text-ink-950
                     font-serif text-xl transition-transform duration-slow
                     active:scale-95"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="Stop scene"
        >
          Stop
        </button>

        {/* Exit to Lush */}
        <button
          onClick={(e) => { e.stopPropagation(); onExitNightstand(); }}
          className="ui-label text-stone-400 hover:text-stone-200
                     transition-colors duration-slow px-4 py-3"
          style={{ minHeight: 44 }}
          aria-label="Exit Nightstand mode"
        >
          Lush mode
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components

function TimerChip({
  timer,
  remaining,
  onTap,
}: {
  timer: TimerMode;
  remaining: number;
  onTap: () => void;
}) {
  // Each state pairs an explicit text label with a colour cue. The
  // colour reinforces the state but never carries it alone — the user
  // is colourblind and several of these greys are nearly indistinguishable
  // for him in particular. Text labels are the load-bearing signal here.
  let label: string;
  let accent: string;

  if (timer.status === 'running') {
    label = `▸ ${formatMs(remaining)}`;
    accent = 'text-moon-300';
  } else if (timer.status === 'fading') {
    label = 'fading…';
    accent = 'text-stone-300 italic';
  } else if (timer.status === 'picking') {
    label = 'pick a time ×';
    accent = 'text-stone-200';
  } else {
    label = 'set timer';
    accent = 'text-stone-400';
  }

  return (
    <button
      onClick={onTap}
      aria-label={
        timer.status === 'running'
          ? `Cancel timer (${formatMs(remaining)} remaining)`
          : timer.status === 'fading'
          ? 'Cancel timer fade'
          : timer.status === 'picking'
          ? 'Close timer picker'
          : 'Set sleep timer'
      }
      className={`ui-label transition-colors duration-slow ${accent}
                  hover:text-stone-100 active:text-moon-300 px-3 py-2`}
      style={{ minHeight: 44 }}
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
      <span className="block body-text text-stone-300 mb-1">
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
