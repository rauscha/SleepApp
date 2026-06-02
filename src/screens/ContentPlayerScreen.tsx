// ContentPlayerScreen — plays a meditation or sleep story MP3.
//
// Uses Howler.js with html5: true for iOS background audio support.
// The caller passes a resolved audioUrl (direct URL or blob URL).
// When the user taps Back, the caller is responsible for revoking any
// blob URL it created.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Howl } from 'howler';
import { getAudioEngine } from '../audio/AudioEngine';
import { getSceneCoordinator } from '../audio/SceneCoordinator';
import {
  fetchSceneDefinition,
  fetchSceneIndex,
} from '../audio/sceneRegistry';
import {
  clearMediaSession,
  setMediaSessionForScene,
  setMediaSessionPlaybackState,
} from '../audio/mediaSession';
import { useWakeLock } from '../hooks/useWakeLock';
import { startSwKeepAlive, stopSwKeepAlive } from '../serviceWorker/keepAlive';
import { recordEvent } from '../diagnostics/lifecycleLog';
import { getSetting, setSetting } from '../storage';

export interface ContentPlayerScreenProps {
  title: string;
  description: string;
  audioUrl: string;
  /** Optional bed scene to play underneath narration. Null/undefined =
   *  no bed (legacy / unpaired content plays bare). */
  bedSceneId?: string | null;
  /** What the bed should do when the user leaves this screen.
   *  'continue' (stories): leave the bed running so the room stays
   *  filled all night after narration ends.
   *  'stop-with-content' (meditations): fade the bed out with the
   *  meditation — but only if WE started it this session. A pre-existing
   *  bed (user was on Tonight first) is left alone. */
  bedBehavior?: 'continue' | 'stop-with-content';
  onBack: () => void;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function ContentPlayerScreen({
  title,
  description,
  audioUrl,
  bedSceneId,
  bedBehavior = 'continue',
  onBack,
}: ContentPlayerScreenProps) {
  const engine = useMemo(() => getAudioEngine(), []);
  const coordinator = useMemo(() => getSceneCoordinator(engine), [engine]);
  const howlRef = useRef<Howl | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'>('loading');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bedAttenuation, setBedAttenuation] = useState<number>(
    () => getSetting('contentBedAttenuation')
  );
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    tickRef.current = setInterval(() => {
      const h = howlRef.current;
      if (!h) return;
      const pos = h.seek() as number;
      if (typeof pos === 'number') setPosition(pos);
    }, 500);
  }, [stopTick]);

  // Build Howl on mount; tear it down on unmount.
  useEffect(() => {
    const h = new Howl({
      src: [audioUrl],
      format: ['mp3'],
      html5: true, // Required for streaming large files + iOS background
      onload: () => {
        setDuration(h.duration());
        setState('ready');
      },
      onplay: () => {
        setState('playing');
        startTick();
      },
      onpause: () => {
        setState('paused');
        stopTick();
      },
      onend: () => {
        setState('ended');
        stopTick();
        setPosition(0);
      },
      onloaderror: (_id: number, err: unknown) => {
        setState('error');
        setErrorMsg(typeof err === 'string' ? err : 'Could not load audio.');
        stopTick();
      },
    });
    howlRef.current = h;
    return () => {
      stopTick();
      h.unload();
      howlRef.current = null;
    };
  }, [audioUrl, startTick, stopTick]);

  // Start the bed scene underneath if one is paired with this content.
  // For stories, we leave the bed running forever on cleanup so the room
  // stays filled after narration ends — the whole point of pairing them.
  // For meditations, the bed stops with the content, but only if WE
  // started it (preserves a pre-existing Tonight scene the user had up).
  // If the same scene is already current, we skip the load and just
  // claim "last played" so Tonight reflects what's actually playing.
  useEffect(() => {
    if (!bedSceneId) return;
    let cancelled = false;
    let startedHere = false;

    void (async () => {
      try {
        const currentId = coordinator.getCurrentScene()?.id ?? null;
        if (currentId !== bedSceneId) {
          const idx = await fetchSceneIndex();
          if (cancelled) return;
          const entry = idx.scenes.find((s) => s.id === bedSceneId);
          if (!entry) {
            console.warn(
              `[ContentPlayerScreen] bed scene "${bedSceneId}" not in index`
            );
            return;
          }
          const def = await fetchSceneDefinition(entry);
          if (cancelled) return;
          await coordinator.startScene(def, { fallbackToSynthetic: true });
          startedHere = true;
        }
        setSetting('lastSceneId', bedSceneId);
        // The screen unmounted during our async startup — undo the start
        // if policy says the bed shouldn't outlive the content.
        if (cancelled && startedHere && bedBehavior === 'stop-with-content') {
          coordinator.stopScene();
        }
      } catch (err) {
        console.error('[ContentPlayerScreen] bed scene start failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (startedHere && bedBehavior === 'stop-with-content') {
        coordinator.stopScene();
      }
    };
  }, [bedSceneId, bedBehavior, coordinator]);

  // Keep the device from suspending the page while a meditation or story
  // is playing. Howler with html5: true uses an HTMLAudioElement which
  // gets OS-level background audio treatment, but the wake lock and
  // MediaSession metadata are what keep the *tab* itself alive long
  // enough on Android for the OS to honour that treatment overnight.
  //
  // For paired bed scenes we extend the lock past `state === 'playing'`:
  // once narration ends, the bed keeps running (stories) until the user
  // backs out, but a released wake lock lets the tab freeze a few hours
  // in — the symptom is "I fell asleep to a story, woke up to silence."
  // Releases only on 'error' or when the bed has actually stopped (the
  // 'stop-with-content' meditation case after narration ends).
  const bedKeepsScreenLive =
    !!bedSceneId &&
    state !== 'error' &&
    !(state === 'ended' && bedBehavior === 'stop-with-content');
  useWakeLock(state === 'playing' || bedKeepsScreenLive);

  // Pull the bed gain down while narration is on top of it. The slider
  // below lets the user tune; default is 50% of the user's chosen master
  // so the singing-bowl + story beds (mixed for standalone listening at
  // ~0.55 primary element) don't drown out the voice. Restore the master
  // on unmount so the standalone Player and Tonight hear the bed at full
  // strength again.
  useEffect(() => {
    if (!bedSceneId) return;
    const master = getSetting('masterVolume');
    engine.bus.setMasterVolume(master * bedAttenuation);
  }, [bedSceneId, bedAttenuation, engine]);
  useEffect(() => {
    if (!bedSceneId) return;
    return () => {
      engine.bus.setMasterVolume(getSetting('masterVolume'));
    };
  }, [bedSceneId, engine]);

  // Keep both Android-focus signals alive whenever this screen is responsible
  // for audio (narration playing OR a bed that's still going). Same condition
  // as the wake lock above — fixes the overnight-silence case where narration
  // ended at minute 30 and the bed limped along without an audio focus signal
  // until the OS finally pulled the tab.
  const keepAudioFocusAlive = state === 'playing' || bedKeepsScreenLive;
  useEffect(() => {
    if (!keepAudioFocusAlive) return;
    engine.startKeepAlive();
    startSwKeepAlive();
    // Mirror the PlayerScreen pattern so story/meditation sessions show up
    // in the lifecycle log alongside scene sessions. Without this, a story
    // playback session is invisible to diagnostics — which is exactly what
    // we hit when trying to read the Signal-interruption incident.
    recordEvent('keepalive-start', 'content');
    return () => {
      engine.stopKeepAlive();
      stopSwKeepAlive();
      recordEvent('keepalive-stop', 'content');
    };
  }, [keepAudioFocusAlive, engine]);

  useEffect(() => {
    if (state === 'loading' || state === 'error') return;
    setMediaSessionForScene(title, {
      onPlay: () => howlRef.current?.play(),
      onPause: () => howlRef.current?.pause(),
      onStop: () => howlRef.current?.stop(),
    });
    return () => clearMediaSession();
  }, [title, state]);

  useEffect(() => {
    if (state === 'playing') setMediaSessionPlaybackState('playing');
    else if (state === 'paused') setMediaSessionPlaybackState('paused');
    else if (state === 'ended') setMediaSessionPlaybackState('none');
  }, [state]);

  const handlePlayPause = useCallback(() => {
    const h = howlRef.current;
    if (!h) return;
    if (state === 'playing') {
      h.pause();
    } else {
      h.play();
    }
  }, [state]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const h = howlRef.current;
    if (!h) return;
    const t = parseFloat(e.target.value);
    h.seek(t);
    setPosition(t);
  }, []);

  const progress = duration > 0 ? position / duration : 0;

  return (
    <div className="bg-ink-950 text-stone-100 flex flex-col max-w-md mx-auto px-6 py-8 min-h-full">
      <header className="mb-8">
        <button
          onClick={onBack}
          className="ui-label text-stone-400 hover:text-stone-200
                     transition-colors duration-slow mb-6 block px-2 py-2"
          style={{ minHeight: 44, minWidth: 44 }}
          aria-label="Back to Library"
        >
          ← Library
        </button>
        <h1 className="font-serif text-stone-50 text-3xl leading-tight mb-2">
          {title}
        </h1>
        <p className="text-stone-400 body-text">{description}</p>
      </header>

      {state === 'error' && (
        <div className="bg-ink-800 rounded-soft px-4 py-3 mb-6">
          <p className="text-ember-400 body-text">{errorMsg}</p>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={1}
          value={position}
          aria-label="Playback position"
          aria-valuetext={`${formatSeconds(position)} of ${formatSeconds(duration)}`}
          onChange={handleSeek}
          disabled={state === 'loading' || state === 'error'}
          className="w-full disabled:opacity-40"
        />
        <div className="flex justify-between ui-label text-stone-400 mt-1 font-mono">
          <span>{formatSeconds(position)}</span>
          <span>{duration > 0 ? formatSeconds(duration) : '--:--'}</span>
        </div>
      </div>

      {/* Play / Pause */}
      <div className="flex justify-center mt-6 mb-8">
        <button
          onClick={handlePlayPause}
          disabled={state === 'loading' || state === 'error'}
          aria-label={state === 'playing' ? 'Pause' : 'Play'}
          className="w-20 h-20 rounded-full bg-moon-600 text-stone-50
                     flex items-center justify-center
                     transition-all duration-slow ease-exhale
                     active:scale-95 active:bg-moon-500
                     disabled:opacity-40 shadow-ambient"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          {state === 'loading' ? (
            <LoadingIcon />
          ) : state === 'ended' ? (
            <ReplayIcon />
          ) : state === 'playing' ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </button>
      </div>

      {/* Status line */}
      <p className="text-center body-text text-stone-400">
        {state === 'loading'
          ? 'Loading…'
          : state === 'playing'
          ? `${Math.round(progress * 100)}% complete`
          : state === 'ended'
          ? 'Finished'
          : null}
      </p>

      {bedSceneId && (
        <div className="mt-10">
          <label className="block">
            <span className="block body-text text-stone-300 mb-2">
              Background — {Math.round(bedAttenuation * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={bedAttenuation}
              aria-label="Background volume"
              aria-valuetext={`${Math.round(bedAttenuation * 100)} percent`}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setBedAttenuation(v);
                setSetting('contentBedAttenuation', v);
              }}
              className="w-full"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// Inline SVGs sized to fill ~40% of the 80px button; currentColor inherits
// the button's text-stone-50 so the icon picks up disabled-state opacity too.

function PlayIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ marginLeft: 3 }}
    >
      <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 4 3 9 8 9" />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      className="animate-spin"
      style={{ animationDuration: '1.4s' }}
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
