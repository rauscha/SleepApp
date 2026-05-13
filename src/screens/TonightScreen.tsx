// Tonight — the default screen.
//
// Brief §7: one primary action per view. The primary action here is
// "start tonight's wind-down." A user who's used the app at least once
// has a last-played scene that the brief implies should be the headline
// pick. We surface that as the big card; secondary affordances (other
// scenes, dev tools) are quiet below it.
//
// This screen does NOT manage playback — it kicks startScene() and
// hands navigation control to the parent (PlayerScreen takes over).

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
  /** Called after the user picks a scene and playback has been kicked. */
  onPlaybackStarted: () => void;
  /** Called when the user taps the discrete "Dev tools" link. */
  onDevToolsRequested: () => void;
}

export function TonightScreen({
  onPlaybackStarted,
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

  // If a scene is already playing (e.g. user navigated back here mid-
  // session) just send them to the player. Doesn't fight HMR either.
  useEffect(() => {
    if (coordinator.getCurrentScene()) {
      onPlaybackStarted();
    }
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

  // Order: last-played first, then the rest in index order.
  const orderedScenes: SceneIndexEntry[] = useMemo(() => {
    if (!index) return [];
    if (!lastSceneId) return index.scenes;
    const last = index.scenes.find((s) => s.id === lastSceneId);
    if (!last) return index.scenes;
    return [last, ...index.scenes.filter((s) => s.id !== lastSceneId)];
  }, [index, lastSceneId]);

  return (
    <div className="min-h-screen bg-ink-950 text-stone-100 px-6 py-10 max-w-md mx-auto flex flex-col">
      <header className="mb-10">
        <h1 className="font-serif text-stone-50 text-4xl leading-tight">
          Tonight
        </h1>
        <p className="text-stone-400 text-sm mt-2">
          {lastSceneId
            ? 'Pick up where you left off — or try something different.'
            : 'A place to land at the end of the day.'}
        </p>
      </header>

      {indexError && (
        <p className="text-ember-400 text-sm mb-4">
          Couldn't load scenes: {indexError}
        </p>
      )}

      <div className="space-y-4 flex-1">
        {orderedScenes.map((entry, idx) => {
          const isPrimary = idx === 0;
          const isBusy = busySceneId === entry.id;
          return (
            <SceneCard
              key={entry.id}
              entry={entry}
              primary={isPrimary}
              busy={isBusy}
              disabled={busySceneId !== null && busySceneId !== entry.id}
              onClick={() => handlePick(entry)}
            />
          );
        })}
      </div>

      {startError && (
        <p className="mt-4 text-xs text-ember-400 break-words">
          Couldn't start scene: {startError}
        </p>
      )}

      <footer className="mt-12 pt-6 border-t border-ink-700 flex justify-between items-center text-xs text-stone-400">
        <span>Phase 3 preview</span>
        <button
          onClick={onDevToolsRequested}
          className="text-stone-400 hover:text-stone-200 active:text-moon-300 transition-colors duration-slow"
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
  busy,
  disabled,
  onClick,
}: {
  entry: SceneIndexEntry;
  primary: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={
        'w-full text-left rounded-softer p-5 transition-all duration-slow ease-exhale ' +
        'disabled:opacity-50 ' +
        (primary
          ? 'bg-moon-700 text-stone-50 hover:bg-moon-600 active:bg-moon-500'
          : 'bg-ink-800 text-stone-100 hover:bg-ink-700 active:bg-ink-600')
      }
    >
      <div className="flex justify-between items-center mb-1">
        <h2 className="font-serif text-2xl leading-tight">{entry.label}</h2>
        {primary && (
          <span className="text-[10px] uppercase tracking-widest text-stone-300">
            last played
          </span>
        )}
      </div>
      <p className="text-sm text-stone-300">
        {busy ? 'Loading…' : primary ? 'Begin' : 'Switch to this'}
      </p>
    </button>
  );
}
