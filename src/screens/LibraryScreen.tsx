// Library — lists the bundled meditations and the bundled sleep stories.
//
// Meditations: fetched from /meditations/index.json (static, bundled).
// Stories: fetched from /stories/index.json (static, bundled).
//
// Everything here is a file that shipped with the build, so tapping any card
// navigates to ContentPlayerScreen with a direct URL. There is no per-user
// content, no IndexedDB read, and nothing to delete — the in-app generator
// that once wrote into this list was removed on 2026-09-15.

import { useCallback, useEffect, useState } from 'react';
import { resolvePublicUrl } from '../lib/baseUrl';
import type {
  BundledStoryMetadata,
  MeditationMetadata,
} from '../storage/types';

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
  // A missing index file (404) is fine — it just means no stories ship with
  // this build, and the tab shows its empty state.
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
  /** Resolved URL for the audio, always a file under public/. */
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
}

type Tab = 'meditations' | 'stories';

export function LibraryScreen({ onPlay }: LibraryScreenProps) {
  const [tab, setTab] = useState<Tab>('meditations');
  const [meditations, setMeditations] = useState<MeditationMetadata[]>([]);
  const [meditationError, setMeditationError] = useState<string | null>(null);
  const [stories, setStories] = useState<BundledStoryMetadata[]>([]);

  useEffect(() => {
    fetchMeditationIndex()
      .then(setMeditations)
      .catch((err) => setMeditationError(String(err)));
    // Stories swallow their own errors — see fetchBundledStoryIndex.
    void fetchBundledStoryIndex().then(setStories);
  }, []);

  const handlePlayMeditation = useCallback(
    (m: MeditationMetadata) => {
      const audioUrl = resolvePublicUrl(`/meditations/${m.audioPath}`);
      onPlay({
        id: m.id,
        type: 'meditation',
        title: m.title,
        description: m.description,
        audioUrl,
        sceneId: m.sceneId ?? null,
      });
    },
    [onPlay]
  );

  const handlePlayStory = useCallback(
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

  function fmtDuration(s: number): string {
    const m = Math.floor(s / 60);
    return `${m} min`;
  }

  return (
    <div className="bg-ink-950 text-stone-100 flex flex-col max-w-md mx-auto px-6 py-8 min-h-full">
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
                  : 'text-stone-300 hover:text-stone-200',
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
              body="This build didn't ship any. Check back after the next update."
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
          {stories.length === 0 && (
            <EmptyState
              heading="No stories yet"
              body="This build didn't ship any. Check back after the next update."
            />
          )}
          <div className="space-y-3">
            {stories.map((s) => (
              <ContentCard
                key={s.id}
                title={s.title}
                description={s.theme}
                meta={fmtDuration(s.durationSeconds)}
                onPlay={() => handlePlayStory(s)}
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
  onPlay,
}: {
  title: string;
  description: string;
  meta: string;
  onPlay: () => void;
}) {
  return (
    <div className="bg-ink-800 rounded-softer px-6 py-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-serif text-stone-50 text-lg leading-tight">{title}</h3>
        <div className="flex gap-3 shrink-0 mt-0.5">
          <button
            onClick={onPlay}
            className="ui-label text-moon-300 hover:text-moon-200
                       transition-colors duration-slow px-2 py-2"
            style={{ minHeight: 44 }}
            aria-label={`Play ${title}`}
          >
            Play →
          </button>
        </div>
      </div>
      <p className="text-stone-300 body-text mb-1">{description}</p>
      <p className="text-stone-300 ui-label">{meta}</p>
    </div>
  );
}

function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="px-1 py-8 text-center">
      <p className="text-stone-300 body-text mb-2">{heading}</p>
      <p className="text-stone-300 body-text max-w-xs mx-auto">{body}</p>
    </div>
  );
}
