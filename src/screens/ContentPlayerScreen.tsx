// ContentPlayerScreen — plays a meditation or sleep story MP3.
//
// Uses Howler.js with html5: true for iOS background audio support.
// The caller passes a resolved audioUrl (direct URL or blob URL).
// When the user taps Back, the caller is responsible for revoking any
// blob URL it created.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';

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
    <div className="min-h-screen bg-ink-950 text-stone-100 flex flex-col max-w-md mx-auto px-6 py-10">
      <header className="mb-10">
        <button
          onClick={onBack}
          className="text-xs text-stone-400 hover:text-stone-200
                     transition-colors duration-slow mb-7 block"
        >
          ← Library
        </button>
        <h1 className="font-serif text-stone-50 text-3xl leading-tight mb-2">
          {title}
        </h1>
        <p className="text-stone-400 text-sm">{description}</p>
      </header>

      {state === 'error' && (
        <div className="bg-ink-800 rounded-soft px-4 py-3 mb-6">
          <p className="text-ember-400 text-sm">{errorMsg}</p>
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
        <div className="flex justify-between text-xs text-stone-500 mt-1">
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
                     font-serif text-lg transition-all duration-slow ease-exhale
                     active:scale-95 active:bg-moon-500
                     disabled:opacity-40 shadow-ambient"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          {state === 'loading'
            ? '…'
            : state === 'ended'
            ? '↺'
            : state === 'playing'
            ? '⏸'
            : '▶'}
        </button>
      </div>

      {/* Status line */}
      <p className="text-center text-xs text-stone-500">
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
