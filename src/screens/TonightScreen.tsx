// Tonight — the default screen.
//
// Brief §7: one primary action per view. The primary action here is
// "start tonight's wind-down." The last-played scene is the headline
// pick; secondary scenes are quieter below it.
//
// Cards layer a dark vertical gradient over the per-scene photograph
// (in public/scenes/photos/). Scenes without a photo fall back to the
// gradient-only treatment used before photos landed.

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
import { sceneCardBackground } from '../lib/sceneBackground';
import { getSetting, setSetting } from '../storage';
import { requestFullscreenSafe } from '../utils/fullscreen';

export interface TonightScreenProps {
  onPlaybackStarted: () => void;
  onDevToolsRequested: () => void;
  /** Unlocks the AudioContext lazily on the first audio gesture. */
  ensureUnlocked: () => Promise<void>;
}

export function TonightScreen({
  onPlaybackStarted,
  onDevToolsRequested,
  ensureUnlocked,
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

  // Note: there's no runtime "if a scene is already playing, bounce to
  // Player" effect here on purpose. App.tsx's initial-state initializer
  // already routes cold-start / HMR cases straight to Player when audio
  // is alive; a runtime redirect would also fire on user-initiated back
  // navigation from Player ("← Scenes") and trap the user in a loop. We
  // accept that picking the currently-playing scene re-enters Player
  // (via the existing handlePick path) as the way to get back.

  const handlePick = useCallback(
    async (entry: SceneIndexEntry) => {
      // Request fullscreen synchronously, before any await — the tap that
      // got us here is the user gesture the Fullscreen API requires, and
      // it expires once we yield to the event loop. iOS standalone PWA
      // silently no-ops; Android Chrome hides system bars for the rest
      // of the player session.
      requestFullscreenSafe();
      setBusySceneId(entry.id);
      setStartError(null);
      try {
        // Lazy AudioContext unlock — the tap itself is the user gesture
        // Web Audio requires. We no longer have a separate "Begin" screen.
        await ensureUnlocked();
        const def = await fetchSceneDefinition(entry);
        await coordinator.startScene(def, {
          // fallbackToSynthetic defaults to import.meta.env.DEV: in prod a
          // missing variant must fail loudly (caught below → startError),
          // not play a synth pad impersonating the scene all night (3.1).
          fadeSeconds: DEFAULT_SCENE_CROSSFADE_SECONDS,
          firstFadeSeconds: DEFAULT_SCENE_FIRST_START_SECONDS,
          // Arm the sleep timer on the session, not the Player (bug H3):
          // the countdown then survives leaving the Player, and re-entering
          // shows the live remaining time instead of re-arming the default.
          sleepTimerMinutes: getSetting('defaultTimerMinutes'),
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
    [coordinator, ensureUnlocked, onPlaybackStarted]
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
    <div className="bg-ink-950 text-stone-100 flex flex-col max-w-md mx-auto px-6 py-8 min-h-full">
      <header className="mb-7 px-1">
        <h1 className="font-serif text-stone-50 text-4xl leading-tight">
          Tonight
        </h1>
        <p className="text-stone-300 body-text mt-2">
          {lastSceneId
            ? 'Pick up where you left off, or try something new.'
            : 'A place to land at the end of the day.'}
        </p>
      </header>

      {indexError && (
        <p className="text-ember-400 body-text mb-4 px-1">
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
            background={sceneCardBackground(entry.id)}
            onClick={() => void handlePick(entry)}
          />
        ))}

        {orderedScenes.length > 1 && (
          <div className="pt-3 flex justify-center">
            <button
              onClick={handleSurpriseMe}
              disabled={busySceneId !== null}
              className="body-text text-stone-300 hover:text-stone-200 active:text-moon-300
                         transition-colors duration-slow disabled:opacity-40
                         px-4 py-2"
            >
              Surprise me
            </button>
          </div>
        )}
      </div>

      {startError && (
        <p className="mt-4 body-text text-ember-400 break-words px-1">
          Couldn't start: {startError}
        </p>
      )}

      {/* Dev tools are dev-only — the prod religion of this app is removing
          everything that isn't sleep. Gated on import.meta.env.DEV so the
          button never ships (roadmap 4.5). */}
      {import.meta.env.DEV && (
        <footer className="mt-8 pt-4 px-1 flex justify-end">
          <button
            onClick={onDevToolsRequested}
            className="text-xs text-stone-300 hover:text-stone-200
                       active:text-moon-300 transition-colors duration-slow
                       px-2 py-2"
            style={{ minHeight: 44 }}
          >
            Dev tools
          </button>
        </footer>
      )}
    </div>
  );
}

function SceneCard({
  entry,
  primary,
  isLastPlayed,
  busy,
  disabled,
  background,
  onClick,
}: {
  entry: SceneIndexEntry;
  primary: boolean;
  isLastPlayed: boolean;
  busy: boolean;
  disabled: boolean;
  background: string;
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
      <div
        className={[
          primary
            ? 'px-6 pt-10 pb-8 min-h-[200px] flex flex-col justify-end'
            : 'px-6 pt-6 pb-5 min-h-[120px] flex flex-col justify-end',
        ].join(' ')}
        style={{ background }}
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
              <span className="text-xs uppercase tracking-widest text-stone-300">
                last played
              </span>
            )}
            {busy ? (
              <span className="ui-label text-stone-300">Loading…</span>
            ) : (
              <span
                className={[
                  'ui-label',
                  primary ? 'text-moon-300' : 'text-stone-300',
                ].join(' ')}
              >
                {primary ? 'Begin →' : '→'}
              </span>
            )}
          </div>
        </div>
        {entry.description && (
          // Scene-card descriptions are reading text — 16px (body-text) per
          // the app's own >=16px floor, not the 14px ui-label they used to
          // ride on for non-primary cards (roadmap 4.4).
          <p className="text-stone-300 body-text">{entry.description}</p>
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
          <div className="bg-ink-800 px-6 pt-6 pb-5">
            <div className="h-6 w-32 bg-ink-600 rounded mb-2" />
            <div className="h-3 w-52 bg-ink-700 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}
