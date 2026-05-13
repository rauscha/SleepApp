# Sleep App

> The One Thing: *Put me to sleep and let me stay there.*

Personal sleep app — soundscapes, AI-generated sleep stories, and AI-generated guided meditations. Progressive Web App. Single user, no accounts, no backend in v1.

The app is in active development. Phases 1 and 2 are complete; Phase 3 (the real Tonight UI) is in progress.

## What's implemented

**Phase 1 — Audio engine**
- AudioContext lifecycle management (`src/audio/AudioEngine.ts`) — user-gesture unlock, suspend/resume on visibility change, AudioWorklet loading.
- Master bus with soft limiter (`src/audio/MasterBus.ts`) — DynamicsCompressorNode tuned as a brick-wall limiter, plus exponential fade-to-silence for the sleep timer.
- Synthesized white / pink / brown noise (`src/audio/NoiseGenerator.ts` + `public/worklets/noise-processor.js`) — true infinite generation per sample, no period.
- Seamless file-loop layer (`src/audio/FileLayer.ts`) — equal-power crossfade, variant rotation, incommensurate loop offsets, 3-iteration pipeline for iOS Safari robustness.
- Storage abstraction (`src/storage/`) — settings in localStorage, audio assets in IndexedDB.
- Tinnitus engine (`ToneMatcher.ts`, `TinnitusMaskLayer.ts`) — built, shelved from UI pending better UX design.

**Phase 2 — Scenes**
- Multi-layer scene format (`src/audio/sceneFormat.ts`) with JSON scene definitions in `public/scenes/`.
- `SceneCoordinator` — 8-second cross-scene fade, synthetic fallback when real audio files are missing.
- 3 starter scenes: Forest midday, Rain on window, Fireplace (Pixabay sources).
- Surprise Me.

**Phase 3 — Tonight UI (in progress)**
- Three-screen router: Tonight → Player → (Harness dev tools).
- Tonight screen: House Blend cards with per-scene gradients (placeholder for real photos), last-played CTA, Surprise me.
- Player screen: big stop button, master volume, collapsible per-layer mixer.
- CI workflow (`.github/workflows/ci.yml`): typecheck + test + build on PR and push.

## What's next

See `NEXT_STEPS.md` for the current priority list. Short version:
- **Phase 3 remaining:** sleep timer chip, Nightstand mode, Settings screen.
- **Phase 4:** pre-generated meditations (bundled), on-demand sleep stories (ElevenLabs + Claude, user's own API keys).
- **Phase 5:** PWA manifest, iOS overnight device test, service worker.

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
