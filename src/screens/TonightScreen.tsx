// Tonight — the default screen.
//
// Brief §7: one primary action per view. The primary action here is
// "start tonight's wind-down." The last-played scene is the headline
// pick; secondary scenes are quieter below it.
//
// Cards use per-scene gradient backgrounds as placeholders for real
// photographs. When photos land, swap the inline gradient style for an
// <img> or CSS background-image — everything else stays the same.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine';
import {
  DEFAULT_SCENE_CROSSFADE_SECONDS,
  DEFAULT_SCENE_FIRST_START_SECONDS,
  getSceneCoordinator,
} from '../audio/SceneCoordinator';
import {
  fetchSceneDefinition,
  fetchSceneIndex,
} from '../audio/sceneRegistry';
import type { SceneIndex, SceneIndexEntry } from '../audio/sceneRegistry';
import { getSetting, setSetting } from '../storage';

export interface TonightScreenProps {
  onPlaybackStarted: () => void;
  onLibraryRequested: () => void;
  onSettingsRequested: () => void;
  onDevToolsRequested: () => void;
}

// Per-scene gradient colours — dark, photographic in feel, blending
// into ink-950 (#0B0D10) at the bottom. Swap for real photos later.
const SCENE_GRADIENTS: Record<string, [string, string]> = {
  'forest-day':     ['#182A1E', '#0B0D10'],
  'rain-on-window': ['#161D2A', '#0B0D10'],
  'fireplace':      ['#2A1810', '#0B0D10'],
};

function sceneGradient(id: string): string {
  const [from, to] = SCENE_GRADIENTS[id] ?? ['#1E2028', '#0B0D10'];
  return `linear-gradient(to bottom, ${from}, ${to})`;
}

export function TonightScreen({
  onPlaybackStarted,
  onLibraryRequested,
  onSettingsRequested,
  onDevToolsRequested,
}: TonightScreenProps) {
  const engine = useMemo(() => getAudioEngine(), []);
  const coordinator = useMemo(() => getSceneCoordinator(engine), [engine]);

  const [index, setIndex] = useState<SceneIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [busySceneId, setBusySceneId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const lastSceneId = getSetting('lastSceneId');

  useEffect(() => {
    let cancelled = false;
    fetchSceneIndex()
      .then((idx) => { if (!cancelled) setIndex(idx); })
      .catch((err) => { if (!cancelled) setIndexError(String(err)); });
    return () => { cancelled = true; };
  }, []);

  // If a scene is already playing (mid-session nav or HMR), send to player.
  useEffect(() => {
    if (coordinator.getCurrentScene()) onPlaybackStarted();
  }, [coordinator, onPlaybackStarted]);

  const handlePick = useCallback(
    async (entry: SceneIndexEntry) => {
      setBusySceneId(entry.id);
      setStartError(null);
      try {
        const def = await fetchSceneDefinition(entry);
        await coordinator.startScene(def, {
          fallbackToSynthetic: true,
          fadeSeconds: DEFAULT_SCENE_CROSSFADE_SECONDS,
          firstFadeSeconds: DEFAULT_SCENE_FIRST_START_SECONDS,
        });
        setSetting('lastSceneId', entry.id);
        onPlaybackStarted();
      } catch (err) {
        console.error('[TonightScreen] startScene failed:', err);
        setStartError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusySceneId(null);
      }
    },
    [coordinator, onPlaybackStarted]
  );

  const handleSurpriseMe = useCallback(() => {
    if (!index || index.scenes.length === 0) return;
    const choices = index.scenes.filter((s) => s.id !== lastSceneId);
    const pool = choices.length > 0 ? choices : index.scenes;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) void handlePick(pick);
  }, [index, lastSceneId, handlePick]);

  // Last-played scene first, then the rest in index order.
  const orderedScenes: SceneIndexEntry[] = useMemo(() => {
    if (!index) return [];
    if (!lastSceneId) return index.scenes;
    const last = index.scenes.find((s) => s.id === lastSceneId);
    if (!last) return index.scenes;
    return [last, ...index.scenes.filter((s) => s.id !== lastSceneId)];
  }, [index, lastSceneId]);

  const isLoading = index === null && indexError === null;

  return (
    <div className="min-h-screen bg-ink-950 text-stone-100 flex flex-col max-w-md mx-auto px-5 py-10">
      <header className="mb-9 px-1">
        <h1 className="font-serif text-stone-50 text-4xl leading-tight">
          Tonight
        </h1>
        <p className="text-stone-400 text-sm mt-2">
          {lastSceneId
            ? 'Pick up where you left off, or try something new.'
            : 'A place to land at the end of the day.'}
        </p>
      </header>

      {indexError && (
        <p className="text-ember-400 text-sm mb-4 px-1">
          Couldn't load scenes: {indexError}
        </p>
      )}

      <div className="flex-1 space-y-3">
        {isLoading && <SkeletonCards />}

        {orderedScenes.map((entry, idx) => (
          <SceneCard
            key={entry.id}
            entry={entry}
            primary={idx === 0}
            isLastPlayed={entry.id === lastSceneId}
            busy={busySceneId === entry.id}
            disabled={busySceneId !== null && busySceneId !== entry.id}
            gradient={sceneGradient(entry.id)}
            onClick={() => handlePick(entry)}
          />
        ))}

        {orderedScenes.length > 1 && (
          <div className="pt-3 flex justify-center">
            <button
              onClick={handleSurpriseMe}
              disabled={busySceneId !== null}
              className="text-sm text-stone-400 hover:text-stone-200 active:text-moon-300
                         transition-colors duration-slow disabled:opacity-40
                         px-4 py-2"
            >
              Surprise me
            </button>
          </div>
        )}
      </div>

      {startError && (
        <p className="mt-4 text-xs text-ember-400 break-words px-1">
          Couldn't start: {startError}
        </p>
      )}

      <footer className="mt-10 pt-5 border-t border-ink-700 flex justify-between items-center px-1">
        <div className="flex gap-4">
          <button
            onClick={onLibraryRequested}
            className="text-xs text-stone-500 hover:text-stone-300 active:text-moon-300
                       transition-colors duration-slow"
          >
            Library
          </button>
          <button
            onClick={onSettingsRequested}
            className="text-xs text-stone-500 hover:text-stone-300 active:text-moon-300
                       transition-colors duration-slow"
          >
            Settings
          </button>
        </div>
        <button
          onClick={onDevToolsRequested}
          className="text-xs text-stone-500 hover:text-stone-300 active:text-moon-300
                     transition-colors duration-slow"
        >
          Dev tools →
        </button>
      </footer>
    </div>
  );
}

function SceneCard({
  entry,
  primary,
  isLastPlayed,
  busy,
  disabled,
  gradient,
  onClick,
}: {
  entry: SceneIndexEntry;
  primary: boolean;
  isLastPlayed: boolean;
  busy: boolean;
  disabled: boolean;
  gradient: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      aria-label={`Play ${entry.label}`}
      className={[
        'w-full text-left rounded-softer overflow-hidden',
        'transition-all duration-slow ease-exhale',
        'disabled:opacity-40',
        primary
          ? 'shadow-ambient active:scale-[0.985]'
          : 'active:scale-[0.99]',
      ].join(' ')}
    >
      {/* Gradient photo placeholder */}
      <div
        className={primary ? 'px-6 pt-10 pb-8' : 'px-5 pt-6 pb-5'}
        style={{ background: gradient }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2
            className={[
              'font-serif text-stone-50 leading-tight',
              primary ? 'text-3xl' : 'text-xl',
            ].join(' ')}
          >
            {entry.label}
          </h2>
          <div className="flex flex-col items-end gap-1 shrink-0 mt-0.5">
            {isLastPlayed && (
              <span className="text-[10px] uppercase tracking-widest text-stone-400">
                last played
              </span>
            )}
            {busy ? (
              <span className="text-xs text-stone-300">Loading…</span>
            ) : (
              <span
                className={[
                  'text-xs',
                  primary ? 'text-moon-300' : 'text-stone-400',
                ].join(' ')}
              >
                {primary ? 'Begin →' : '→'}
              </span>
            )}
          </div>
        </div>
        {entry.description && (
          <p
            className={[
              'text-stone-400 leading-relaxed',
              primary ? 'text-sm' : 'text-xs',
            ].join(' ')}
          >
            {entry.description}
          </p>
        )}
      </div>
    </button>
  );
}

function SkeletonCards() {
  return (
    <>
      <div className="rounded-softer overflow-hidden animate-pulse">
        <div className="bg-ink-800 px-6 pt-10 pb-8">
          <div className="h-8 w-40 bg-ink-600 rounded mb-3" />
          <div className="h-4 w-64 bg-ink-700 rounded" />
        </div>
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-softer overflow-hidden animate-pulse">
          <div className="bg-ink-800 px-5 pt-6 pb-5">
            <div className="h-6 w-32 bg-ink-600 rounded mb-2" />
            <div className="h-3 w-52 bg-ink-700 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}
