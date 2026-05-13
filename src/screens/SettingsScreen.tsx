// Settings — reachable from the Tonight footer.
//
// Sections:
//   Playback  — master volume, default sleep timer
//   AI features — ElevenLabs + Anthropic API key fields (live, Phase 4)
//
// Keys are stored in localStorage only and never leave the device.
// Fields use type=password with a show/hide toggle.

import { useMemo, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine';
import { getAllSettings, setSetting } from '../storage';

const TIMER_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Off',    value: null },
  { label: '15 min', value: 15   },
  { label: '30 min', value: 30   },
  { label: '60 min', value: 60   },
  { label: '90 min', value: 90   },
];

export interface SettingsScreenProps {
  onBack: () => void;
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const engine = useMemo(() => getAudioEngine(), []);
  const [settings, setSettings] = useState(() => getAllSettings());

  function update<K extends 'masterVolume' | 'defaultTimerMinutes' | 'elevenLabsApiKey' | 'anthropicApiKey'>(
    key: K,
    value: (typeof settings)[K]
  ) {
    setSetting(key, value);
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="min-h-screen bg-ink-950 text-stone-100 flex flex-col max-w-md mx-auto px-5 py-10">
      <header className="mb-10 px-1">
        <button
          onClick={onBack}
          className="text-xs text-stone-400 hover:text-stone-200
                     transition-colors duration-slow mb-6 block"
          aria-label="Back to Tonight"
        >
          ← Tonight
        </button>
        <h1 className="font-serif text-stone-50 text-4xl leading-tight">
          Settings
        </h1>
      </header>

      {/* ── Playback ─────────────────────────────────────────────────── */}
      <section className="mb-8 px-1">
        <h2 className="font-serif text-stone-300 text-lg mb-5">Playback</h2>

        <div className="mb-6">
          <label className="block">
            <span className="block text-sm text-stone-300 mb-2">
              Master volume — {Math.round(settings.masterVolume * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.masterVolume}
              aria-label="Master volume"
              aria-valuetext={`${Math.round(settings.masterVolume * 100)} percent`}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                update('masterVolume', v);
                if (engine.isInitialized) engine.bus.setMasterVolume(v);
              }}
            />
          </label>
        </div>

        <div>
          <p className="text-sm text-stone-300 mb-2">Default sleep timer</p>
          <p className="text-xs text-stone-500 mb-3">
            When set, the timer starts automatically every time you begin a scene.
          </p>
          <div className="flex flex-wrap gap-2">
            {TIMER_OPTIONS.map((opt) => {
              const selected = settings.defaultTimerMinutes === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  onClick={() => update('defaultTimerMinutes', opt.value)}
                  aria-pressed={selected}
                  className={[
                    'px-3 py-1.5 rounded-soft text-xs transition-colors duration-slow',
                    selected
                      ? 'bg-moon-600 text-stone-50'
                      : 'bg-ink-700 text-stone-300 hover:bg-ink-600',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="h-px bg-ink-700 mb-8" />

      {/* ── AI features ──────────────────────────────────────────────── */}
      <section className="mb-8 px-1">
        <h2 className="font-serif text-stone-300 text-lg mb-2">AI features</h2>
        <p className="text-xs text-stone-500 mb-5">
          Your keys are stored in this browser only and are never sent
          anywhere except directly to ElevenLabs and Anthropic from your
          device.
        </p>

        <ApiKeyField
          label="ElevenLabs API key"
          placeholder="elevenlabs_…"
          hint="Used for voice synthesis · ~$1–3 per story"
          value={settings.elevenLabsApiKey ?? ''}
          onChange={(v) => update('elevenLabsApiKey', v || null)}
        />
        <ApiKeyField
          label="Anthropic API key"
          placeholder="sk-ant-…"
          hint="Used to write story scripts · ~$0.10 per story"
          value={settings.anthropicApiKey ?? ''}
          onChange={(v) => update('anthropicApiKey', v || null)}
        />
      </section>

      <div className="h-px bg-ink-700 mb-8" />

      {/* ── About ─────────────────────────────────────────────────────── */}
      <footer className="px-1 text-xs text-stone-500 space-y-1">
        <p>Sleep App · v0.1.0</p>
        <p>No accounts. No telemetry. No notifications. Ever.</p>
      </footer>
    </div>
  );
}

function ApiKeyField({
  label,
  placeholder,
  hint,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="mb-5">
      <label className="block">
        <span className="block text-sm text-stone-400 mb-1">{label}</span>
        <span className="block text-xs text-stone-600 mb-2">{hint}</span>
        <div className="relative">
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-ink-800 text-stone-200 text-xs rounded-soft
                       px-3 py-2.5 pr-12 border border-ink-600
                       placeholder-ink-500 focus:outline-none
                       focus:border-moon-600 transition-colors"
            aria-label={label}
          />
          {value && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2
                         text-xs text-stone-500 hover:text-stone-300
                         transition-colors"
              aria-label={visible ? 'Hide key' : 'Show key'}
            >
              {visible ? 'hide' : 'show'}
            </button>
          )}
        </div>
      </label>
    </div>
  );
}
