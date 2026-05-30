// ContentPlayerScreen — plays a meditation or sleep story MP3.
//
// Uses Howler.js with html5: true for iOS background audio support.
// The caller passes a resolved audioUrl (direct URL or blob URL).
// When the user taps Back, the caller is responsible for revoking any
// blob URL it created.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';
import {
  clearMediaSession,
  setMediaSessionForScene,
  setMediaSessionPlaybackState,
} from '../audio/mediaSession';
import { useWakeLock } from '../hooks/useWakeLock';
import { startSwKeepAlive, stopSwKeepAlive } from '../serviceWorker/keepAlive';

export interface ContentPlayerScreenProps {
  title: string;
  description: string;
  audioUrl: string;
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
  onBack,
}: ContentPlayerScreenProps) {
  const howlRef = useRef<Howl | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'>('loading');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  // Keep the device from suspending the page while a meditation or story
  // is playing. Howler with html5: true uses an HTMLAudioElement which
  // gets OS-level background audio treatment, but the wake lock and
  // MediaSession metadata are what keep the *tab* itself alive long
  // enough on Android for the OS to honour that treatment overnight.
  useWakeLock(state === 'playing');

  useEffect(() => {
    if (state !== 'playing') return;
    startSwKeepAlive();
    return () => stopSwKeepAlive();
  }, [state]);

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
