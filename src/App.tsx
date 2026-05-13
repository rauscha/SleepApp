import { useEffect, useMemo, useRef, useState } from 'react';
import { getAudioEngine } from './audio/AudioEngine';
import { NoiseGenerator } from './audio/NoiseGenerator';
import { TinnitusMaskLayer } from './audio/TinnitusMaskLayer';
import { ToneMatcher } from './audio/ToneMatcher';
import { FileLayer } from './audio/FileLayer';
import { getAllSettings, setSetting } from './storage';
import type { NoiseColor } from './audio/types';
import { generateTestPadBuffer } from './audio/synth/testPad';

// Phase-1 development harness. NOT the real Tonight UI -- that's Phase 3.
// This page exposes every audio-engine feature behind sliders and buttons
// so you can verify the engine end-to-end.

export function App() {
  const engine = useMemo(() => getAudioEngine(), []);
  const [unlocked, setUnlocked] = useState(false);
  const [settings, setSettings] = useState(() => getAllSettings());
  const [contextState, setContextState] = useState(engine.state);

  useEffect(() => {
    const unsub = engine.addListener((e) => {
      if (e.kind === 'state') setContextState(e.state);
    });
    return unsub;
  }, [engine]);

  if (!unlocked) {
    return (
      <UnlockGate
        onUnlock={async () => {
          await engine.unlock();
          await engine.loadNoiseWorklet();
          setUnlocked(true);
          setContextState(engine.state);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-ink-950 text-stone-100 px-6 py-8 max-w-md mx-auto">
      <header className="mb-8">
        <h1 className="text-stone-50 font-serif text-3xl">Sleep -- engine harness</h1>
        <p className="text-stone-300 text-sm mt-1">
          Phase 1 development surface. AudioContext: {contextState}
        </p>
      </header>

      <Spectrum />
      <Divider />
      <NoiseSection />
      <Divider />
      <ToneMatcherSection
        initialHz={settings.tinnitus.centerHz}
        onSave={(hz, bw) => {
          setSetting('tinnitus', {
            ...settings.tinnitus,
            centerHz: hz,
            bandwidthHz: bw,
            hasCalibrated: true,
          });
          setSettings(getAllSettings());
        }}
      />
      <Divider />
      <TinnitusMaskSection
        centerHz={settings.tinnitus.centerHz}
        bandwidthHz={settings.tinnitus.bandwidthHz}
      />
      <Divider />
      <CrossfadeSection />
      <Divider />
      <MasterSection
        initialVolume={settings.masterVolume}
        onChange={(v) => setSetting('masterVolume', v)}
      />
    </div>
  );
}

function UnlockGate({ onUnlock }: { onUnlock: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center px-8 bg-ink-950">
      <div className="text-center">
        <h1 className="font-serif text-stone-50 text-4xl mb-3">Ready to wind down?</h1>
        <p className="text-stone-300 text-base mb-8 max-w-xs">
          Tap to begin. The audio engine wakes up here.
        </p>
        <button
          className="px-7 py-3 rounded-soft bg-moon-500 text-ink-950 font-medium transition-all duration-slow ease-exhale active:bg-moon-400 disabled:opacity-50"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onUnlock();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Waking up...' : 'Begin'}
        </button>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-ink-700 my-8" />;
}

function Spectrum() {
  const engine = useMemo(() => getAudioEngine(), []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const analyser = engine.bus.analyser;
    const buf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx2d = canvas.getContext('2d');
        if (ctx2d) {
          analyser.getByteFrequencyData(buf);
          const W = canvas.width;
          const H = canvas.height;
          ctx2d.fillStyle = '#10131A';
          ctx2d.fillRect(0, 0, W, H);
          const sampleRate = engine.context.sampleRate;
          const nyquist = sampleRate / 2;
          const minHz = 30;
          ctx2d.fillStyle = '#9BB7AE';
          for (let x = 0; x < W; x++) {
            const t = x / (W - 1);
            const hz = minHz * Math.pow(nyquist / minHz, t);
            const bin = Math.min(buf.length - 1, Math.floor((hz / nyquist) * buf.length));
            const v = buf[bin] ?? 0;
            const h = (v / 255) * H;
            ctx2d.fillRect(x, H - h, 1, h);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <Section title="Spectrum">
      <p className="text-xs text-stone-300 mb-2">
        Log-frequency, ~30 Hz to Nyquist. White ~ flat; pink slopes down ~3 dB/oct;
        brown slopes down ~6 dB/oct; tinnitus mask shows a peak.
      </p>
      <canvas
        ref={canvasRef}
        width={360}
        height={90}
        className="w-full rounded-soft bg-ink-800"
      />
    </Section>
  );
}

function NoiseSection() {
  const engine = useMemo(() => getAudioEngine(), []);
  const [color, setColor] = useState<NoiseColor>('pink');
  const [volume, setVolume] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const layerRef = useRef<NoiseGenerator | null>(null);

  const ensureLayer = () => {
    if (!layerRef.current) {
      const layer = new NoiseGenerator(engine, {
        id: 'synth-bed',
        color,
        defaultVolume: volume,
      });
      engine.addLayer(layer);
      layerRef.current = layer;
    }
    return layerRef.current;
  };

  return (
    <Section title="Synth bed (white / pink / brown)">
      <div className="flex gap-2 mb-4">
        {(['white', 'pink', 'brown'] as const).map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c);
              layerRef.current?.setColor(c);
            }}
            className={
              'px-3 py-1 rounded-soft text-sm transition-all duration-slow ease-exhale ' +
              (color === c ? 'bg-moon-500 text-ink-950' : 'bg-ink-800 text-stone-200')
            }
          >
            {c}
          </button>
        ))}
      </div>
      <Slider
        label={'Volume -- ' + Math.round(volume * 100) + '%'}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          layerRef.current?.setVolume(v);
        }}
      />
      <div className="mt-3">
        <PlayPause
          playing={playing}
          onPlay={() => {
            const layer = ensureLayer();
            layer.start();
            setPlaying(true);
          }}
          onStop={() => {
            if (layerRef.current) {
              // Fire-and-forget: removeLayer unregisters synchronously and
              // fades + disposes in the background. UI flips to Stopped
              // immediately; audio tail completes in 0.2–5s depending on
              // the layer.
              void engine.removeLayer(layerRef.current.id);
              layerRef.current = null;
            }
            setPlaying(false);
          }}
        />
      </div>
    </Section>
  );
}

function ToneMatcherSection({
  initialHz,
  onSave,
}: {
  initialHz: number;
  onSave: (hz: number, bandwidthHz: number) => void;
}) {
  const engine = useMemo(() => getAudioEngine(), []);
  const matcherRef = useRef<ToneMatcher | null>(null);
  const [sliderPos, setSliderPos] = useState(ToneMatcher.hzToSlider(initialHz));
  const [bandwidth, setBandwidth] = useState(400);
  const [playing, setPlaying] = useState(false);

  const hz = ToneMatcher.sliderToHz(sliderPos);

  return (
    <Section title="Tinnitus tone matcher">
      <p className="text-xs text-stone-300 mb-3">
        Slide until the tone matches your tinnitus. Logarithmic scale, 2 kHz to 12 kHz.
      </p>
      <Slider
        label={'Frequency -- ' + Math.round(hz) + ' Hz'}
        value={sliderPos}
        onChange={(v) => {
          setSliderPos(v);
          if (matcherRef.current) {
            matcherRef.current.setFrequency(ToneMatcher.sliderToHz(v));
          }
        }}
      />
      <div className="mt-2">
        <Slider
          label={'Bandwidth -- ' + Math.round(bandwidth / 2) + ' Hz each side'}
          value={(bandwidth - 50) / (1000 - 50)}
          onChange={(v) => setBandwidth(50 + v * (1000 - 50))}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={async () => {
            if (playing) {
              await matcherRef.current?.stop();
              setPlaying(false);
            } else {
              if (!matcherRef.current) {
                matcherRef.current = new ToneMatcher(engine.context, engine.bus.input);
                matcherRef.current.setFrequency(hz);
                matcherRef.current.setVolume(0.08);
              }
              matcherRef.current.start();
              setPlaying(true);
            }
          }}
          className="px-3 py-1 rounded-soft text-sm bg-ink-800 text-stone-100"
        >
          {playing ? 'Stop tone' : 'Play tone'}
        </button>
        <button
          onClick={() => onSave(hz, bandwidth)}
          className="px-3 py-1 rounded-soft text-sm bg-moon-500 text-ink-950"
        >
          Save
        </button>
      </div>
    </Section>
  );
}

function TinnitusMaskSection({
  centerHz,
  bandwidthHz,
}: {
  centerHz: number;
  bandwidthHz: number;
}) {
  const engine = useMemo(() => getAudioEngine(), []);
  const layerRef = useRef<TinnitusMaskLayer | null>(null);
  const [volume, setVolume] = useState(0.2);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    layerRef.current?.setCenterFrequency(centerHz);
    layerRef.current?.setBandwidth(bandwidthHz);
  }, [centerHz, bandwidthHz]);

  return (
    <Section title="Tinnitus masking layer">
      <p className="text-xs text-stone-300 mb-3">
        Band-passed white noise at {Math.round(centerHz)} Hz, +/-
        {' '}{Math.round(bandwidthHz / 2)} Hz.
      </p>
      <Slider
        label={'Volume -- ' + Math.round(volume * 100) + '%'}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          layerRef.current?.setVolume(v);
        }}
      />
      <div className="mt-3">
        <PlayPause
          playing={playing}
          onPlay={() => {
            if (!layerRef.current) {
              const layer = new TinnitusMaskLayer(engine, {
                centerHz,
                bandwidthHz,
                defaultVolume: volume,
              });
              engine.addLayer(layer);
              layerRef.current = layer;
            }
            layerRef.current.start();
            setPlaying(true);
          }}
          onStop={() => {
            if (layerRef.current) {
              // Fire-and-forget: removeLayer unregisters synchronously and
              // fades + disposes in the background. UI flips to Stopped
              // immediately; audio tail completes in 0.2–5s depending on
              // the layer.
              void engine.removeLayer(layerRef.current.id);
              layerRef.current = null;
            }
            setPlaying(false);
          }}
        />
      </div>
    </Section>
  );
}

function CrossfadeSection() {
  const engine = useMemo(() => getAudioEngine(), []);
  const layerRef = useRef<FileLayer | null>(null);
  const [volume, setVolume] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [building, setBuilding] = useState(false);

  return (
    <Section title="Seamless crossfade -- synthesized test pad">
      <p className="text-xs text-stone-300 mb-3">
        Two synthesized test tones run through a FileLayer with a 5-second
        equal-power crossfade and 12-second loop offset. There should be no
        loop seam.
      </p>
      <Slider
        label={'Volume -- ' + Math.round(volume * 100) + '%'}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          layerRef.current?.setVolume(v);
        }}
      />
      <div className="mt-3">
        <PlayPause
          playing={playing}
          disabled={building}
          onPlay={async () => {
            setBuilding(true);
            try {
              if (!layerRef.current) {
                const ctx = engine.context;
                const variants = [
                  {
                    id: 'pad-220',
                    buffer: generateTestPadBuffer(ctx, 18, 220),
                    loopOffsetSeconds: 12,
                  },
                  {
                    id: 'pad-261',
                    buffer: generateTestPadBuffer(ctx, 18, 261),
                    loopOffsetSeconds: 12,
                  },
                ];
                const layer = new FileLayer(engine, {
                  id: 'crossfade-demo',
                  label: 'Crossfade test',
                  variants,
                  crossfadeSeconds: 5,
                  defaultVolume: volume,
                  variantRotation: 'sequential',
                });
                engine.addLayer(layer);
                layerRef.current = layer;
              }
              layerRef.current.start();
              setPlaying(true);
            } finally {
              setBuilding(false);
            }
          }}
          onStop={() => {
            if (layerRef.current) {
              // Fire-and-forget: removeLayer unregisters synchronously and
              // fades + disposes in the background. UI flips to Stopped
              // immediately; audio tail completes in 0.2–5s depending on
              // the layer.
              void engine.removeLayer(layerRef.current.id);
              layerRef.current = null;
            }
            setPlaying(false);
          }}
        />
      </div>
    </Section>
  );
}

function MasterSection({
  initialVolume,
  onChange,
}: {
  initialVolume: number;
  onChange: (v: number) => void;
}) {
  const engine = useMemo(() => getAudioEngine(), []);
  const [volume, setVolume] = useState(initialVolume);

  useEffect(() => {
    engine.bus.setMasterVolume(initialVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Section title="Master">
      <Slider
        label={'Master -- ' + Math.round(volume * 100) + '%'}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          engine.bus.setMasterVolume(v);
          onChange(v);
        }}
      />
      <div className="mt-3 flex gap-2 flex-wrap">
        <button
          onClick={() => engine.bus.fadeToSilence(10)}
          className="px-3 py-1 rounded-soft text-sm bg-ink-800 text-stone-200"
          title="Demo of the timer fade -- exponential to silence over 10s"
        >
          Fade out (10s)
        </button>
        <button
          onClick={() => engine.bus.cancelFade(volume, 1)}
          className="px-3 py-1 rounded-soft text-sm bg-ink-800 text-stone-200"
        >
          Cancel fade
        </button>
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-stone-50 text-xl mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-stone-300 mb-1">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-valuetext={`${Math.round(value * 100)} percent`}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

function PlayPause({
  playing,
  onPlay,
  onStop,
  disabled,
}: {
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => (playing ? onStop() : onPlay())}
      className={
        'px-4 py-2 rounded-soft text-sm transition-all duration-slow ease-exhale ' +
        (playing ? 'bg-ember-500 text-ink-950' : 'bg-moon-500 text-ink-950') +
        ' disabled:opacity-50'
      }
    >
      {playing ? 'Stop' : 'Play'}
    </button>
  );
}
