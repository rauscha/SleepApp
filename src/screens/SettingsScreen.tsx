// Settings — reachable from the Tonight footer.
//
// Sections:
//   Playback  — master volume, default sleep timer
//   AI features — ElevenLabs + Anthropic API key fields (live, Phase 4)
//
// Keys are stored in localStorage only and never leave the device.
// Fields use type=password with a show/hide toggle.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getAudioEngine } from '../audio/AudioEngine';
import {
  clearLog,
  formatAsText,
  getAllEntries,
  type LogEntry,
} from '../diagnostics/lifecycleLog';
import {
  getOfflineStatus,
  isServiceWorkerControlling,
  precacheOfflineAssets,
  type OfflineStatus,
  type PrecacheProgress,
} from '../services/offlinePrecache';
import {
  getAllSettings,
  hasAnthropicEnvKey,
  hasElevenLabsEnvKey,
  setSetting,
} from '../storage';

const TIMER_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Off',    value: null },
  { label: '15 min', value: 15   },
  { label: '30 min', value: 30   },
  { label: '60 min', value: 60   },
  { label: '90 min', value: 90   },
];

export interface SettingsScreenProps {
  /** Reserved — bottom nav handles primary back. */
  onBack?: () => void;
}

export function SettingsScreen(_props: SettingsScreenProps) {
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
    <div className="bg-ink-950 text-stone-100 flex flex-col max-w-md mx-auto px-5 py-8 min-h-full">
      <header className="mb-8 px-1">
        <h1 className="font-serif text-stone-50 text-4xl leading-tight">
          Settings
        </h1>
      </header>

      {/* ── Playback ─────────────────────────────────────────────────── */}
      <section className="mb-8 px-1">
        <h2 className="font-serif text-stone-300 text-lg mb-5">Playback</h2>

        <div className="mb-6">
          <label className="block">
            <span className="block body-text text-stone-300 mb-2">
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
          <p className="body-text text-stone-300 mb-2">Default sleep timer</p>
          <p className="body-text text-stone-400 mb-3">
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
                    'px-3 py-2 rounded-soft ui-label transition-colors duration-slow',
                    selected
                      ? 'bg-moon-600 text-stone-50'
                      : 'bg-ink-700 text-stone-300 hover:bg-ink-600',
                  ].join(' ')}
                  style={{ minHeight: 44 }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="h-px bg-ink-700 mb-8" />

      {/* ── Offline ──────────────────────────────────────────────────── */}
      <section className="mb-8 px-1">
        <h2 className="font-serif text-stone-300 text-lg mb-2">Offline</h2>
        <p className="body-text text-stone-400 mb-5">
          Download every scene, meditation, and bundled story so the app
          plays with no network. About 290 MB total. Already-downloaded
          files are skipped, so tapping this again is safe.
        </p>
        <OfflineDownloadPanel />
      </section>

      <div className="h-px bg-ink-700 mb-8" />

      {/* ── AI features ──────────────────────────────────────────────── */}
      <section className="mb-8 px-1">
        <h2 className="font-serif text-stone-300 text-lg mb-2">AI features</h2>
        <p className="body-text text-stone-400 mb-5">
          Your keys are stored in this browser only and are never sent
          anywhere except directly to ElevenLabs and Anthropic from your
          device.
        </p>

        <ApiKeyField
          label="ElevenLabs API key"
          placeholder="elevenlabs_…"
          hint="Used for voice synthesis · ~$1–3 per story"
          value={settings.elevenLabsApiKey ?? ''}
          envOverride={hasElevenLabsEnvKey()}
          onChange={(v) => update('elevenLabsApiKey', v || null)}
        />
        <ApiKeyField
          label="Anthropic API key"
          placeholder="sk-ant-…"
          hint="Used to write story scripts · ~$0.10 per story"
          value={settings.anthropicApiKey ?? ''}
          envOverride={hasAnthropicEnvKey()}
          onChange={(v) => update('anthropicApiKey', v || null)}
        />
      </section>

      <div className="h-px bg-ink-700 mb-8" />

      {/* ── Diagnostics ──────────────────────────────────────────────── */}
      <section className="mb-8 px-1">
        <h2 className="font-serif text-stone-300 text-lg mb-2">Diagnostics</h2>
        <p className="body-text text-stone-400 mb-5">
          Local-only log of page lifecycle events (visibility, freeze/resume,
          audio state). Useful when an overnight session ends earlier than
          expected. Nothing leaves the device unless you share it.
        </p>
        <DiagnosticsPanel />
      </section>

      <div className="h-px bg-ink-700 mb-8" />

      {/* ── About ─────────────────────────────────────────────────────── */}
      <footer className="px-1 ui-label text-stone-500 space-y-1">
        <p>Sleep App · v0.1.0</p>
        <p>No accounts. No telemetry. No notifications. Ever.</p>
      </footer>
    </div>
  );
}

function OfflineDownloadPanel() {
  // Status starts null while we discover the URL list. `swControlling` is
  // captured on mount because dev (vite serve) doesn't activate the SW —
  // we disable the button in that case rather than silently no-op.
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PrecacheProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const swControlling = useMemo(() => isServiceWorkerControlling(), []);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = async () => {
    setStatusError(null);
    try {
      const s = await getOfflineStatus();
      setStatus(s);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : 'Failed to read offline status'
      );
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const running = progress !== null;

  const handleDownload = async () => {
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    setProgress({ done: 0, total: 0, currentUrl: null });
    try {
      await precacheOfflineAssets({
        signal: ac.signal,
        onProgress: (p) => setProgress(p),
      });
      await refresh();
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        setError(
          err instanceof Error ? err.message : 'Offline download failed'
        );
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  if (!swControlling) {
    return (
      <p className="body-text text-stone-300 bg-ink-800 rounded-soft px-3 py-2.5">
        The service worker isn't active in this environment, so a download
        wouldn't persist. Install the app (Add to Home Screen) or run a
        production build to enable offline.
      </p>
    );
  }

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div className="space-y-3">
      {status && !running && (
        <p className="body-text text-stone-300">
          {status.complete ? (
            <span className="text-moon-300">
              Ready to play offline · {status.totalCount} files cached
            </span>
          ) : (
            <>
              {status.cachedCount} of {status.totalCount} files cached
            </>
          )}
        </p>
      )}

      {statusError && (
        <p className="body-text text-red-400" role="status">
          {statusError}
        </p>
      )}

      {running && progress && (
        <div className="space-y-2">
          <p className="body-text text-stone-300" role="status">
            Downloading… {progress.done} / {progress.total} ({pct}%)
          </p>
          <div className="h-1.5 bg-ink-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-moon-600 transition-[width] duration-slow"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!running && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={status?.complete === true}
            className={[
              'px-3 py-2 rounded-soft ui-label transition-colors duration-slow',
              status?.complete
                ? 'bg-ink-700 text-stone-500 cursor-not-allowed'
                : 'bg-moon-600 text-stone-50 hover:bg-moon-500',
            ].join(' ')}
            style={{ minHeight: 44 }}
          >
            {status?.complete ? 'Already downloaded' : 'Download for offline'}
          </button>
        )}
        {running && (
          <button
            type="button"
            onClick={handleCancel}
            className="bg-ink-700 text-stone-300 hover:bg-ink-600 px-3 py-2
                       rounded-soft ui-label transition-colors duration-slow"
            style={{ minHeight: 44 }}
          >
            Cancel
          </button>
        )}
      </div>

      {error && (
        <p className="body-text text-red-400" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

function DiagnosticsPanel() {
  const [entries, setEntries] = useState<LogEntry[]>(() => getAllEntries());
  const [status, setStatus] = useState<string | null>(null);

  const refresh = () => setEntries(getAllEntries());

  const lastTen = entries.slice(-10).reverse();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatAsText());
      setStatus('Copied to clipboard.');
    } catch {
      setStatus('Copy failed — try Share instead.');
    }
  };

  const handleShare = async () => {
    const text = formatAsText();
    // Web Share API on Android Chrome offers Gmail / Drive / Messages.
    // iOS Safari also supports it. Fall back to clipboard otherwise.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'Sleep app lifecycle log',
          text,
        });
        setStatus('Shared.');
        return;
      } catch (err) {
        // User cancelled — not an error to surface loudly.
        if ((err as Error)?.name !== 'AbortError') {
          setStatus('Share failed — try Copy instead.');
        }
        return;
      }
    }
    handleCopy();
  };

  const handleDownload = () => {
    const blob = new Blob([formatAsText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `sleep-lifecycle-${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded.');
  };

  const handleClear = () => {
    clearLog();
    refresh();
    setStatus('Log cleared.');
  };

  return (
    <div className="space-y-3">
      <p className="body-text text-stone-300">
        {entries.length} {entries.length === 1 ? 'entry' : 'entries'} captured
        {entries.length > 0 && (
          <>
            {' '}· last:{' '}
            <span className="text-stone-200">
              {new Date(entries[entries.length - 1]!.ts).toLocaleString()}
            </span>
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        <DiagButton onClick={handleShare}>Share…</DiagButton>
        <DiagButton onClick={handleCopy}>Copy</DiagButton>
        <DiagButton onClick={handleDownload}>Download</DiagButton>
        <DiagButton onClick={handleClear} variant="quiet">Clear</DiagButton>
        <DiagButton onClick={refresh} variant="quiet">Refresh</DiagButton>
      </div>

      {status && (
        <p className="body-text text-moon-300" role="status">
          {status}
        </p>
      )}

      {lastTen.length > 0 && (
        <div className="mt-3 bg-ink-800 rounded-soft p-3 max-h-56 overflow-y-auto">
          <p className="ui-label text-stone-400 mb-2">
            Most recent {lastTen.length} (newest first):
          </p>
          <ul className="space-y-1 ui-label font-mono text-stone-300">
            {lastTen.map((e, i) => (
              <li key={`${e.ts}-${i}`} className="leading-snug break-words">
                <span className="text-stone-400">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>{' '}
                <span className="text-stone-200">{e.kind}</span>
                {e.detail && (
                  <span className="text-stone-400"> · {e.detail}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DiagButton({
  children,
  onClick,
  variant = 'normal',
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'normal' | 'quiet';
}) {
  const cls =
    variant === 'quiet'
      ? 'bg-ink-700 text-stone-400 hover:bg-ink-600 hover:text-stone-200'
      : 'bg-moon-600 text-stone-50 hover:bg-moon-500';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cls} px-3 py-2 rounded-soft ui-label transition-colors duration-slow`}
      style={{ minHeight: 44 }}
    >
      {children}
    </button>
  );
}

function ApiKeyField({
  label,
  placeholder,
  hint,
  value,
  envOverride = false,
  onChange,
}: {
  label: string;
  placeholder: string;
  hint: string;
  value: string;
  envOverride?: boolean;
  onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="mb-5">
      <label className="block">
        <span className="block body-text text-stone-300 mb-1">{label}</span>
        <span className="block body-text text-stone-400 mb-2">{hint}</span>
        {envOverride ? (
          <p className="body-text text-moon-300 bg-ink-800 rounded-soft px-3 py-2.5">
            Loaded from build env — no entry needed.
          </p>
        ) : (
          <div className="relative">
            <input
              type={visible ? 'text' : 'password'}
              value={value}
              placeholder={placeholder}
              onChange={(e) => onChange(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-ink-800 text-stone-200 body-text rounded-soft
                         px-3 py-2.5 pr-16 border border-ink-600
                         placeholder-ink-400 focus:outline-none
                         focus:border-moon-600 transition-colors"
              aria-label={label}
            />
            {value && (
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2
                           ui-label text-stone-400 hover:text-stone-200
                           transition-colors px-2 py-2"
                style={{ minHeight: 44 }}
                aria-label={visible ? 'Hide key' : 'Show key'}
              >
                {visible ? 'hide' : 'show'}
              </button>
            )}
          </div>
        )}
      </label>
    </div>
  );
}
