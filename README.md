# Sleep App

> The One Thing: *Put me to sleep and let me stay there.*

Personal sleep app — soundscapes, AI-generated sleep stories, and AI-generated guided meditations. Progressive Web App. Single user, no accounts, no backend in v1.

This repo currently contains **Phase 1** from the build brief: the audio engine foundation. The UI you see when you run it is a *development harness* (a control panel to exercise the engine), NOT the real Tonight UI — that's Phase 3.

## What's implemented

- AudioContext lifecycle management (`src/audio/AudioEngine.ts`) — handles user-gesture unlock, suspend/resume on visibility change, and AudioWorklet module loading.
- Master bus with soft limiter (`src/audio/MasterBus.ts`) — DynamicsCompressorNode tuned as a brick-wall limiter, plus an exponential fade-to-silence used by the timer.
- Synthesized white / pink / brown noise (`src/audio/NoiseGenerator.ts` + `public/worklets/noise-processor.js`) — true infinite generation per sample, no loop.
- Tinnitus tone matcher (`src/audio/ToneMatcher.ts`) — pure sine, log-spaced 2–12 kHz, click-free start/stop.
- Tinnitus masking layer (`src/audio/TinnitusMaskLayer.ts`) — band-passed white noise with a runtime-tunable center frequency and bandwidth.
- Seamless file-loop layer (`src/audio/FileLayer.ts`) — equal-power crossfade with variant rotation and incommensurate loop offsets.
- Storage abstraction (`src/storage/`) — settings in localStorage, audio assets in IndexedDB, single-source-of-truth API so a backend swap requires no consumer changes.
- Phase-1 dev harness UI (`src/App.tsx`) — exercise everything above end-to-end.

## What's *not* done yet

This is exactly the Phase-1 list. Following phases (per brief §11):
- **Phase 2** — multi-layer scenes, JSON scene format, variant pool, Surprise Me.
- **Phase 3** — the real Tonight UI, House Blends, mixer, settings, Build Your Own, Lush vs Nightstand modes.
- **Phase 4** — ElevenLabs + Claude integration, story generation pipeline, library screen.
- **Phase 5** — timer UI wiring, PWA manifest + offline, iOS Safari background-audio testing, perf profiling.

## Running it

```bash
npm install
npm run dev
```

Opens on http://localhost:5173. Tap "Begin" — that's the user gesture that unlocks the AudioContext. Then everything else is sliders and play buttons.

**Don't skip the Begin gate.** Browsers refuse to start audio without a user gesture; the page simply has no sound before you've tapped.

## Reading the code

If you only read three files, read these — in order:

1. **`src/audio/AudioEngine.ts`** — the single owner of the AudioContext and the registry of layers. Where the lifecycle bodies are buried.
2. **`src/audio/FileLayer.ts`** — the most subtle file. The seamless-crossfade scheduling has comments explaining why the timing works the way it does.
3. **`DECISIONS.md`** — every non-trivial choice I made tonight, with rationale and "reject this" instructions for the ones you might disagree with.

## Files at a glance

```
src/
├── audio/
│   ├── AudioEngine.ts          # Context lifecycle, master bus owner, layer registry
│   ├── MasterBus.ts            # Master gain → soft limiter → destination
│   ├── NoiseGenerator.ts       # Synth bed Layer (wraps the worklet)
│   ├── TinnitusMaskLayer.ts    # Band-passed white noise Layer
│   ├── ToneMatcher.ts          # Pure sine for tinnitus calibration
│   ├── FileLayer.ts            # Seamless looping + variant rotation
│   ├── crossfade.ts            # Equal-power crossfade math
│   ├── types.ts                # Layer interface + shared types
│   └── synth/
│       └── testPad.ts          # In-browser test tone (dev harness only)
├── storage/
│   ├── index.ts                # Public surface — import from here
│   ├── types.ts                # UserSettings + StoryMetadata + StoredAudioAsset
│   ├── settings.ts             # localStorage backend
│   └── assets.ts               # IndexedDB backend
├── App.tsx                     # Phase-1 dev harness
├── main.tsx                    # React entry
└── index.css                   # Tailwind + a few dark-mode globals
public/
└── worklets/
    └── noise-processor.js      # AudioWorkletProcessor (must be plain JS)
```

## Anti-goals from the brief, restated for emphasis

No alarm clock. No tracking, scoring, or "performance" metrics. No notifications, ever. No accounts, no telemetry, no analytics, no ads. No mandatory onboarding. No end-of-track sounds.
