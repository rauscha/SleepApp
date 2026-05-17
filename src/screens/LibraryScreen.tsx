// Library — lists bundled meditations and user-generated stories.
//
// Meditations: fetched from /meditations/index.json (static, bundled).
// Stories: fetched from IndexedDB via listStories().
//
// Tapping a meditation navigates to ContentPlayerScreen with a direct URL.
// Tapping a story loads its audio from IndexedDB, creates a blob URL, and
// navigates to ContentPlayerScreen with that URL (revoked on back).

import { useCallback, useEffect, useState } from 'react';
import { getStoryAudio, listStories, deleteStory } from '../storage';
import type { MeditationMetadata, StoryMetadata } from '../storage/types';

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

export interface ContentItem {
  id: string;
  type: 'meditation' | 'story';
  title: string;
  description: string;
  /** Resolved URL or blob URL for the audio. Caller owns revocation. */
  audioUrl: string;
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
  const [stories, setStories] = useState<StoryMetadata[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    fetchMeditationIndex()
      .then(setMeditations)
      .catch((err) => setMeditationError(String(err)));
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
        });
      } catch (err) {
        console.error('[LibraryScreen] story load failed:', err);
        alert(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingId(null);
      }
    },
    [onPlay]
  );

  const handleDeleteStory = useCallback(
    async (id: string) => {
      if (!confirm('Delete this story? This cannot be undone.')) return;
      try {
        await deleteStory(id);
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
                'flex-1 py-2 text-xs rounded capitalize transition-colors duration-slow',
                tab === t
                  ? 'bg-ink-600 text-stone-100'
                  : 'text-stone-400 hover:text-stone-200',
              ].join(' ')}
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
            <p className="text-ember-400 text-sm mb-4 px-1">
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
          <div className="flex justify-end mb-4 px-1">
            <button
              onClick={onGenerateStory}
              className="text-xs text-moon-300 hover:text-moon-200
                         transition-colors duration-slow px-3 py-1.5
                         border border-moon-700 rounded-soft"
            >
              Generate new story →
            </button>
          </div>
          {stories.length === 0 && (
            <EmptyState
              heading="No stories yet"
              body="Add your ElevenLabs and Anthropic API keys in Settings, then generate a story."
            />
          )}
          <div className="space-y-3">
            {stories.map((s) => (
              <ContentCard
                key={s.id}
                title={s.title}
                description={s.theme}
                meta={fmtDuration(s.durationSeconds)}
                busy={loadingId === s.id}
                onPlay={() => handlePlayStory(s)}
                onDelete={() => handleDeleteStory(s.id)}
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
  onPlay,
  onDelete,
}: {
  title: string;
  description: string;
  meta: string;
  busy?: boolean;
  onPlay: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="bg-ink-800 rounded-softer px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-serif text-stone-50 text-lg leading-tight">{title}</h3>
        <div className="flex gap-2 shrink-0 mt-0.5">
          <button
            onClick={onPlay}
            disabled={busy}
            className="text-xs text-moon-300 hover:text-moon-200
                       transition-colors duration-slow disabled:opacity-40 px-1"
            aria-label={`Play ${title}`}
          >
            {busy ? 'Loading…' : 'Play →'}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-xs text-stone-500 hover:text-ember-400
                         transition-colors duration-slow px-1"
              aria-label={`Delete ${title}`}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <p className="text-stone-400 text-xs mb-1">{description}</p>
      <p className="text-stone-600 text-xs">{meta}</p>
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
      <p className="text-stone-300 text-sm mb-2">{heading}</p>
      <p className="text-stone-500 text-xs max-w-xs mx-auto mb-3">{body}</p>
      {codeHint && (
        <code className="text-xs text-moon-300 bg-ink-800 px-2 py-1 rounded-soft">
          {codeHint}
        </code>
      )}
    </div>
  );
}
