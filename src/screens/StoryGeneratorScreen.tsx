// Story generator — lets the user enter a theme, pick a voice, and
// kick off a Claude→ElevenLabs→IndexedDB generation pipeline.
//
// Shows live step progress ("Writing script…", "Synthesizing…", "Saving…").
// Generation takes 1–5 minutes; the screen stays open while it runs.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAnthropicApiKey,
  getElevenLabsApiKey,
} from '../storage';
import { generateStory } from '../services/storyGenerator';
import type { GenerationStep } from '../services/storyGenerator';
import { fetchSceneIndex } from '../audio/sceneRegistry';
import type { SceneIndexEntry } from '../audio/sceneRegistry';

type VoiceName = 'tide' | 'stone';

const VOICE_DESCRIPTIONS: Record<VoiceName, string> = {
  tide:  'Soft, intimate (female)',
  stone: 'Warm, resonant (male)',
};

// Window during which the same (theme, voice) combo is treated as a
// duplicate of an immediately-prior request and rejected with an inline
// hint instead of firing a fresh API call. Picked to catch genuine
// double-taps and accidental re-submits without ever blocking a user
// who legitimately wants the same theme back-to-back.
const DEDUP_WINDOW_MS = 30_000;

interface RecentAttempt {
  theme: string;
  voice: VoiceName;
  at: number;
}

export interface StoryGeneratorScreenProps {
  onBack: () => void;
  /** Called after a story is successfully saved, with the new story id. */
  onDone: (storyId: string) => void;
}

export function StoryGeneratorScreen({
  onBack,
  onDone,
}: StoryGeneratorScreenProps) {
  const [theme, setTheme] = useState('');
  const [voice, setVoice] = useState<VoiceName>('tide');
  const [scenes, setScenes] = useState<SceneIndexEntry[]>([]);
  // `null` here means "no bed". On first load we replace it with the
  // first scene from the index as the default — picked by the user via
  // the dropdown thereafter.
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Keep the controller in a ref so the Cancel button can reach it without
  // forcing a re-render every time it changes. Aborted on unmount as well
  // so leaving the screen mid-generation tears the fetch down.
  const abortRef = useRef<AbortController | null>(null);
  // Last (theme, voice, timestamp) attempt — see DEDUP_WINDOW_MS. Held
  // in a ref so the dedup check sees the freshest value without React
  // batching a re-render between two same-tick taps.
  const lastAttemptRef = useRef<RecentAttempt | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Load the scene catalogue once so the user can pick a bed.
  // Default the selection to the first scene if we don't have one yet.
  useEffect(() => {
    let cancelled = false;
    fetchSceneIndex()
      .then((idx) => {
        if (cancelled) return;
        setScenes(idx.scenes);
        setSceneId((current) => current ?? idx.scenes[0]?.id ?? null);
      })
      .catch((err) => {
        // Scene-pick is non-blocking — failing the index just means the
        // user generates a story without a paired bed. They can hand-edit
        // sceneId later via dev tools if it really matters.
        console.warn('[StoryGeneratorScreen] scene index load failed:', err);
      });
    return () => { cancelled = true; };
  }, []);

  const addStep = useCallback((msg: string) => {
    setSteps((prev) => [...prev, msg]);
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleGenerate = useCallback(async () => {
    // Re-entrance guard. `busy` already disables the visible button,
    // but a synchronous double-tap on a slow device can land before
    // React has applied the disabled state, so the function-level
    // guard is the actual line of defence.
    if (busy) return;
    const anthropicKey = getAnthropicApiKey();
    const elevenLabsKey = getElevenLabsApiKey();

    if (!anthropicKey) {
      setError('Add your Anthropic API key in Settings first.');
      return;
    }
    if (!elevenLabsKey) {
      setError('Add your ElevenLabs API key in Settings first.');
      return;
    }
    if (!theme.trim()) {
      setError('Enter a theme to get started.');
      return;
    }

    const trimmedTheme = theme.trim();
    const last = lastAttemptRef.current;
    if (
      last &&
      last.theme === trimmedTheme &&
      last.voice === voice &&
      Date.now() - last.at < DEDUP_WINDOW_MS
    ) {
      setError('Already generating that one. Give it a moment.');
      return;
    }
    lastAttemptRef.current = { theme: trimmedTheme, voice, at: Date.now() };

    setBusy(true);
    setError(null);
    setSteps([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const meta = await generateStory({
        theme: trimmedTheme,
        voiceName: voice,
        anthropicApiKey: anthropicKey,
        elevenLabsApiKey: elevenLabsKey,
        sceneId,
        signal: controller.signal,
        onProgress: (step: GenerationStep) => {
          if (step.stage !== 'done') addStep(step.message);
        },
      });
      onDone(meta.id);
    } catch (err) {
      // AbortError is the user pressing Cancel — not really an error.
      // Cancelled / failed attempts also clear the dedup memo so a
      // legitimate retry with the same (theme, voice) is not blocked.
      lastAttemptRef.current = null;
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Cancelled.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setBusy(false);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [busy, theme, voice, sceneId, addStep, onDone]);

  return (
    <div className="bg-ink-950 text-stone-100 flex flex-col max-w-md mx-auto px-6 py-8 min-h-full">
      <header className="mb-8">
        <button
          onClick={onBack}
          disabled={busy}
          className="ui-label text-stone-400 hover:text-stone-200
                     transition-colors duration-slow mb-6 block
                     disabled:opacity-40 px-2 py-2"
          style={{ minHeight: 44 }}
          aria-label="Back to Library"
        >
          ← Library
        </button>
        <h1 className="font-serif text-stone-50 text-3xl leading-tight mb-2">
          New story
        </h1>
        <p className="text-stone-400 body-text">
          Claude writes the script · ElevenLabs narrates it · takes 2–5 min
        </p>
      </header>

      <div className="space-y-7">
        {/* Theme */}
        <div>
          <label htmlFor="theme" className="block body-text text-stone-300 mb-2">
            Theme
          </label>
          <input
            id="theme"
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            disabled={busy}
            placeholder="A slow walk through an autumn forest"
            className="w-full bg-ink-800 text-stone-100 body-text rounded-soft
                       px-3 py-2.5 border border-ink-600
                       placeholder-stone-500 focus:outline-none
                       focus:border-moon-600 transition-colors
                       disabled:opacity-40"
          />
        </div>

        {/* Voice */}
        <div>
          <p className="body-text text-stone-300 mb-3">Voice</p>
          <div className="space-y-2">
            {(['tide', 'stone'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVoice(v)}
                disabled={busy}
                className={[
                  'w-full text-left px-4 py-3 rounded-soft body-text',
                  'transition-colors duration-slow disabled:opacity-40',
                  voice === v
                    ? 'bg-ink-600 text-stone-100'
                    : 'bg-ink-800 text-stone-300 hover:bg-ink-700',
                ].join(' ')}
                style={{ minHeight: 44 }}
              >
                <span className="capitalize font-medium">{v}</span>
                <span className="text-stone-400 ml-2 ui-label">
                  — {VOICE_DESCRIPTIONS[v]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Bed scene */}
        <div>
          <label htmlFor="bed-scene" className="block body-text text-stone-300 mb-2">
            Background scene
          </label>
          <select
            id="bed-scene"
            value={sceneId ?? ''}
            onChange={(e) => setSceneId(e.target.value || null)}
            disabled={busy || scenes.length === 0}
            className="w-full bg-ink-800 text-stone-100 body-text rounded-soft
                       px-3 py-2.5 border border-ink-600
                       focus:outline-none focus:border-moon-600
                       transition-colors disabled:opacity-40"
            style={{ minHeight: 44 }}
          >
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="ui-label text-stone-400 mt-2">
            Plays underneath the narration, then keeps going all night.
          </p>
        </div>

        {/* Cost note */}
        <p className="body-text text-stone-400 px-1">
          Estimated cost: ~$0.05–0.10 (Claude) + ~$1–3 (ElevenLabs) per
          story. Stories are saved permanently — no regeneration needed.
        </p>

        {/* Generate / Cancel button */}
        {busy ? (
          <div className="flex justify-end">
            <button
              onClick={handleCancel}
              className="border border-moon-700 rounded-soft text-moon-300
                         hover:text-moon-200 px-3 py-1.5 ui-label
                         transition-colors duration-slow"
              style={{ minHeight: 44 }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!theme.trim()}
            className="w-full py-3 rounded-soft bg-moon-600 text-stone-50
                       body-text font-medium transition-all duration-slow ease-exhale
                       active:bg-moon-500 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ minHeight: 44 }}
          >
            Generate story
          </button>
        )}

        {/* Progress steps */}
        {steps.length > 0 && (
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 body-text text-stone-400">
                <span className="text-moon-400">✓</span>
                <span>{s}</span>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 body-text text-stone-300">
                <span className="animate-pulse text-moon-300">●</span>
                <span>Running…</span>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-ink-800 rounded-soft px-4 py-3">
            <p className="text-ember-400 body-text">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
