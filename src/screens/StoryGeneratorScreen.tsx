// Story generator — lets the user enter a theme, pick a voice, and
// kick off a Claude→ElevenLabs→IndexedDB generation pipeline.
//
// Shows live step progress ("Writing script…", "Synthesizing…", "Saving…").
// Generation takes 1–5 minutes; the screen stays open while it runs.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSetting } from '../storage';
import { generateStory } from '../services/storyGenerator';
import type { GenerationStep } from '../services/storyGenerator';

type VoiceName = 'hush' | 'ember' | 'glen';

const VOICE_DESCRIPTIONS: Record<VoiceName, string> = {
  hush:  'Soft, intimate',
  ember: 'Warm, storytelling',
  glen:  'Deep, resonant',
};

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
  const [voice, setVoice] = useState<VoiceName>('hush');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Keep the controller in a ref so the Cancel button can reach it without
  // forcing a re-render every time it changes. Aborted on unmount as well
  // so leaving the screen mid-generation tears the fetch down.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const addStep = useCallback((msg: string) => {
    setSteps((prev) => [...prev, msg]);
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleGenerate = useCallback(async () => {
    const anthropicKey = getSetting('anthropicApiKey');
    const elevenLabsKey = getSetting('elevenLabsApiKey');

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

    setBusy(true);
    setError(null);
    setSteps([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const meta = await generateStory({
        theme: theme.trim(),
        voiceName: voice,
        anthropicApiKey: anthropicKey,
        elevenLabsApiKey: elevenLabsKey,
        signal: controller.signal,
        onProgress: (step: GenerationStep) => {
          if (step.stage !== 'done') addStep(step.message);
        },
      });
      onDone(meta.id);
    } catch (err) {
      // AbortError is the user pressing Cancel — not really an error.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Cancelled.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setBusy(false);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [theme, voice, addStep, onDone]);

  return (
    <div className="min-h-screen bg-ink-950 text-stone-100 flex flex-col max-w-md mx-auto px-6 py-10">
      <header className="mb-10">
        <button
          onClick={onBack}
          disabled={busy}
          className="text-xs text-stone-400 hover:text-stone-200
                     transition-colors duration-slow mb-7 block
                     disabled:opacity-40"
        >
          ← Library
        </button>
        <h1 className="font-serif text-stone-50 text-3xl leading-tight mb-2">
          New story
        </h1>
        <p className="text-stone-400 text-sm">
          Claude writes the script · ElevenLabs narrates it · takes 2–5 min
        </p>
      </header>

      <div className="space-y-7">
        {/* Theme */}
        <div>
          <label htmlFor="theme" className="block text-sm text-stone-300 mb-2">
            Theme
          </label>
          <input
            id="theme"
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            disabled={busy}
            placeholder="A slow walk through an autumn forest"
            className="w-full bg-ink-800 text-stone-100 text-sm rounded-soft
                       px-3 py-2.5 border border-ink-600
                       placeholder-stone-600 focus:outline-none
                       focus:border-moon-600 transition-colors
                       disabled:opacity-40"
          />
        </div>

        {/* Voice */}
        <div>
          <p className="text-sm text-stone-300 mb-3">Voice</p>
          <div className="space-y-2">
            {(['hush', 'ember', 'glen'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVoice(v)}
                disabled={busy}
                className={[
                  'w-full text-left px-4 py-3 rounded-soft text-sm',
                  'transition-colors duration-slow disabled:opacity-40',
                  voice === v
                    ? 'bg-ink-600 text-stone-100'
                    : 'bg-ink-800 text-stone-300 hover:bg-ink-700',
                ].join(' ')}
              >
                <span className="capitalize font-medium">{v}</span>
                <span className="text-stone-500 ml-2 text-xs">
                  — {VOICE_DESCRIPTIONS[v]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Cost note */}
        <p className="text-xs text-stone-500 px-1">
          Estimated cost: ~$0.05–0.10 (Claude) + ~$1–3 (ElevenLabs) per
          story. Stories are saved permanently — no regeneration needed.
        </p>

        {/* Generate / Cancel button */}
        {busy ? (
          <button
            onClick={handleCancel}
            className="w-full py-3 rounded-soft bg-ink-700 text-stone-200
                       text-sm font-medium transition-all duration-slow ease-exhale
                       active:bg-ink-600"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!theme.trim()}
            className="w-full py-3 rounded-soft bg-moon-600 text-stone-50
                       text-sm font-medium transition-all duration-slow ease-exhale
                       active:bg-moon-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate story
          </button>
        )}

        {/* Progress steps */}
        {steps.length > 0 && (
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-stone-400">
                <span className="text-moon-400">✓</span>
                <span>{s}</span>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-stone-300">
                <span className="animate-pulse text-moon-300">●</span>
                <span>Running…</span>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-ink-800 rounded-soft px-4 py-3">
            <p className="text-ember-400 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
