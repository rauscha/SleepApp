// Library — lists bundled meditations, bundled stories, and user-generated
// stories.
//
// Meditations: fetched from /meditations/index.json (static, bundled).
// Bundled stories: fetched from /stories/index.json (static, bundled).
// User stories: fetched from IndexedDB via listStories().
//
// Tapping a meditation or a bundled story navigates to ContentPlayerScreen
// with a direct URL. Tapping a user-generated story loads its audio from
// IndexedDB, creates a blob URL, and navigates with that URL (revoked on
// back). Bundled stories are read-only — no delete button.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { isBedtime } from '../lib/bedtime';
import { getStoryAudio, listStories, deleteStory } from '../storage';
import type {
  BundledStoryMetadata,
  MeditationMetadata,
  StoryMetadata,
} from '../storage/types';

function resolvePublicUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function fetchMeditationIndex(): Promise<MeditationMetadata[]> {
  const url = resolvePublicUrl('/meditations/index.json');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meditation index failed: ${res.status}`);
  const data = (await res.json()) as { meditations: MeditationMetadata[] };
  return data.meditations;
}

async function fetchBundledStoryIndex(): Promise<BundledStoryMetadata[]> {
  const url = resolvePublicUrl('/stories/index.json');
  const res = await fetch(url);
  // A missing index file (404) is fine — it just means no bundled
  // stories ship with this build. Errors are swallowed silently so a
  // bad fetch doesn't break the user-generated stories list below it.
  if (!res.ok) return [];
  try {
    const data = (await res.json()) as { stories: BundledStoryMetadata[] };
    return data.stories ?? [];
  } catch {
    return [];
  }
}

export interface ContentItem {
  id: string;
  type: 'meditation' | 'story';
  title: string;
  description: string;
  /** Resolved URL or blob URL for the audio. Caller owns revocation. */
  audioUrl: string;
  /** Bed scene id to play underneath while this content plays. Stories
   *  leave the bed running after narration ends so the room stays
   *  filled. Meditations stop the bed with the content. Optional —
   *  legacy content without a paired scene plays bare. */
  sceneId?: string | null;
}

export interface LibraryScreenProps {
  /**
   * Reserved for callers that want a back affordance — the bottom nav now
   * provides the primary way back to Tonight, so most consumers can omit
   * this. Kept for backward compatibility with the App's routing shape.
   */
  onBack?: () => void;
  onPlay: (item: ContentItem) => void;
  onGenerateStory: () => void;
}

type Tab = 'meditations' | 'stories';

export function LibraryScreen({
  onPlay,
  onGenerateStory,
}: LibraryScreenProps) {
  const [tab, setTab] = useState<Tab>('meditations');
  const [meditations, setMeditations] = useState<MeditationMetadata[]>([]);
  const [meditationError, setMeditationError] = useState<string | null>(null);
  const [bundledStories, setBundledStories] = useState<BundledStoryMetadata[]>([]);
  const [stories, setStories] = useState<StoryMetadata[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [storyError, setStoryError] = useState<{ id: string; message: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Re-evaluate the bedtime window once a minute so the Generate CTA
  // flips disable state cleanly across the 21:00 / 06:00 boundaries
  // even if the user is sitting on this screen. Once-a-minute is cheap
  // and matches how the gate visibly resolves at minute precision.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const bedtime = useMemo(() => isBedtime(new Date(nowTick)), [nowTick]);

  useEffect(() => {
    fetchMeditationIndex()
      .then(setMeditations)
      .catch((err) => setMeditationError(String(err)));
    // Bundled stories swallow their own errors — see fetchBundledStoryIndex.
    fetchBundledStoryIndex().then(setBundledStories);
  }, []);

  const refreshStories = useCallback(() => {
    listStories().then(setStories).catch(console.error);
  }, []);

  useEffect(() => {
    if (tab === 'stories') refreshStories();
  }, [tab, refreshStories]);

  const handlePlayMeditation = useCallback(
    (m: MeditationMetadata) => {
      const audioUrl = resolvePublicUrl(`/meditations/${m.audioPath}`);
      onPlay({
        id: m.id,
        type: 'meditation',
        title: m.title,
        description: m.description,
        audioUrl,
      });
    },
    [onPlay]
  );

  const handlePlayStory = useCallback(
    async (story: StoryMetadata) => {
      setLoadingId(story.id);
      setStoryError(null);
      try {
        const asset = await getStoryAudio(story.id);
        if (!asset) throw new Error('Audio not found — try regenerating.');
        const blob = new Blob([asset.data], { type: asset.mimeType });
        const audioUrl = URL.createObjectURL(blob);
        onPlay({
          id: story.id,
          type: 'story',
          title: story.title,
          description: story.theme,
          audioUrl,
          sceneId: story.sceneId,
        });
      } catch (err) {
        console.error('[LibraryScreen] story load failed:', err);
        setStoryError({
          id: story.id,
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setLoadingId(null);
      }
    },
    [onPlay]
  );

  const handlePlayBundledStory = useCallback(
    (story: BundledStoryMetadata) => {
      const audioUrl = resolvePublicUrl(`/stories/${story.audioPath}`);
      onPlay({
        id: story.id,
        type: 'story',
        title: story.title,
        description: story.theme,
        audioUrl,
        sceneId: story.sceneId ?? null,
      });
    },
    [onPlay]
  );

  const handleConfirmDelete = useCallback(
    async (id: string) => {
      try {
        await deleteStory(id);
        setConfirmDeleteId((current) => (current === id ? null : current));
        refreshStories();
      } catch (err) {
        console.error('[LibraryScreen] delete failed:', err);
      }
    },
    [refreshStories]
  );

  function fmtDuration(s: number): string {
    const m = Math.floor(s / 60);
    return `${m} min`;
  }

  return (
    <div className="bg-ink-950 text-stone-100 flex flex-col max-w-md mx-auto px-5 py-8 min-h-full">
      <header className="mb-6 px-1">
        <h1 className="font-serif text-stone-50 text-4xl leading-tight mb-6">
          Library
        </h1>
        {/* Tabs */}
        <div className="flex gap-1 bg-ink-800 rounded-soft p-1">
          {(['meditations', 'stories'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'flex-1 py-2 ui-label rounded capitalize transition-colors duration-slow',
                tab === t
                  ? 'bg-ink-600 text-stone-100'
                  : 'text-stone-400 hover:text-stone-200',
              ].join(' ')}
              style={{ minHeight: 44 }}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {/* ── Meditations ─────────────────────────────────────────────── */}
      {tab === 'meditations' && (
        <div className="flex-1">
          {meditationError && (
            <p className="text-ember-400 body-text mb-4 px-1">
              Couldn't load: {meditationError}
            </p>
          )}
          {meditations.length === 0 && !meditationError && (
            <EmptyState
              heading="No meditations yet"
              body="Run the gen-meditation CLI tool to generate your first meditation and bundle it with the app."
              codeHint="npx tsx tools/gen-meditation.ts"
            />
          )}
          <div className="space-y-3">
            {meditations.map((m) => (
              <ContentCard
                key={m.id}
                title={m.title}
                description={m.description}
                meta={`${m.style.replace('-', ' ')} · ${fmtDuration(m.durationSeconds)}`}
                onPlay={() => handlePlayMeditation(m)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Stories ──────────────────────────────────────────────────── */}
      {tab === 'stories' && (
        <div className="flex-1">
          <div className="flex flex-col items-end mb-4 px-1 gap-2">
            <button
              onClick={onGenerateStory}
              disabled={bedtime}
              className="ui-label text-moon-300 hover:text-moon-200
                         transition-colors duration-slow px-3 py-1.5
                         border border-moon-700 rounded-soft
                         disabled:opacity-40 disabled:cursor-not-allowed
                         disabled:hover:text-moon-300"
              style={{ minHeight: 44 }}
              aria-describedby={bedtime ? 'bedtime-note' : undefined}
            >
              Generate new story →
            </button>
            {bedtime && (
              <p
                id="bedtime-note"
                className="ui-label text-stone-400 italic max-w-xs text-right"
              >
                A daytime activity. Try again after 6am.
              </p>
            )}
          </div>
          {bundledStories.length === 0 && stories.length === 0 && (
            <EmptyState
              heading="No stories yet"
              body="Add your ElevenLabs and Anthropic API keys in Settings, then generate a story."
            />
          )}
          <div className="space-y-3">
            {bundledStories.map((s) => (
              <ContentCard
                key={s.id}
                title={s.title}
                description={s.theme}
                meta={fmtDuration(s.durationSeconds)}
                onPlay={() => handlePlayBundledStory(s)}
              />
            ))}
            {stories.map((s) => (
              <ContentCard
                key={s.id}
                title={s.title}
                description={s.theme}
                meta={fmtDuration(s.durationSeconds)}
                busy={loadingId === s.id}
                errorMessage={storyError?.id === s.id ? storyError.message : null}
                confirmingDelete={confirmDeleteId === s.id}
                onPlay={() => handlePlayStory(s)}
                onDelete={() => setConfirmDeleteId(s.id)}
                onConfirmDelete={() => handleConfirmDelete(s.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ContentCard({
  title,
  description,
  meta,
  busy = false,
  errorMessage = null,
  confirmingDelete = false,
  onPlay,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  title: string;
  description: string;
  meta: string;
  busy?: boolean;
  errorMessage?: string | null;
  confirmingDelete?: boolean;
  onPlay: () => void;
  onDelete?: () => void;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
}) {
  return (
    <div className="bg-ink-800 rounded-softer px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-serif text-stone-50 text-lg leading-tight">{title}</h3>
        <div className="flex gap-3 shrink-0 mt-0.5">
          {confirmingDelete ? (
            <>
              <button
                onClick={onCancelDelete}
                className="ui-label text-stone-400 hover:text-stone-200
                           transition-colors duration-slow px-2 py-2"
                style={{ minHeight: 44 }}
                aria-label="Cancel delete"
              >
                Cancel
              </button>
              <button
                onClick={onConfirmDelete}
                className="ui-label text-ember-400 hover:text-ember-300
                           transition-colors duration-slow px-2 py-2"
                style={{ minHeight: 44 }}
                aria-label={`Confirm delete ${title}`}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onPlay}
                disabled={busy}
                className="ui-label text-moon-300 hover:text-moon-200
                           transition-colors duration-slow disabled:opacity-40
                           px-2 py-2"
                style={{ minHeight: 44 }}
                aria-label={`Play ${title}`}
              >
                {busy ? 'Loading…' : 'Play →'}
              </button>
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="ui-label text-stone-500 hover:text-ember-400
                             transition-colors duration-slow px-2 py-2"
                  style={{ minHeight: 44, minWidth: 44 }}
                  aria-label={`Delete ${title}`}
                >
                  ×
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <p className="text-stone-400 body-text mb-1">{description}</p>
      <p className="text-stone-500 ui-label">{meta}</p>
      {errorMessage && (
        <p
          role="alert"
          className="text-ember-400 body-text mt-2"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function EmptyState({
  heading,
  body,
  codeHint,
}: {
  heading: string;
  body: string;
  codeHint?: string;
}) {
  return (
    <div className="px-1 py-8 text-center">
      <p className="text-stone-300 body-text mb-2">{heading}</p>
      <p className="text-stone-400 body-text max-w-xs mx-auto mb-3">{body}</p>
      {codeHint && (
        <code className="ui-label text-moon-300 bg-ink-800 px-2 py-1 rounded-soft">
          {codeHint}
        </code>
      )}
    </div>
  );
}
