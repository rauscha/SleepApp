# Review of tonight's work + queue for next sessions

A second pass over Phase 1 with fresh eyes, plus what to tackle next. Read in priority order; cherry-pick what you want me to do first.

---

## A. Bugs & correctness — ranked by severity

### A1. iOS Safari `setTimeout` throttling can desync the FileLayer scheduler [Phase 5, must-fix before sleep-tested]
The FileLayer schedules iteration N+1 via `setTimeout` with a 1.5s lookahead. When iOS backgrounds the page, `setTimeout` is throttled to ~1Hz minimum. If our timer fires after the intended `currentTime`, `source.start(absoluteTime)` will start in the past — silently. The result: the new iteration starts immediately with no crossfade, OR is dropped, depending on browser. Either is a loop seam.

**Fix.** Schedule 2-3 iterations ahead instead of 1. The audio is already on the AudioContext clock once `start(absoluteTime)` is called, so even severe `setTimeout` throttling can't break audio that's already scheduled. The `setTimeout` becomes a once-per-iteration "schedule the next-next-next one" trigger that has wide latitude to fire late.

**Cost.** ~1 hour.

### A2. `removeLayer` blocks on the layer's full fade-out [Phase 2, fix during scene work]
A FileLayer's `stop()` waits the full crossfade duration (5s) before resolving. So `engine.removeLayer(id)` takes 5 seconds to return. For scene transitions the brief specifies an 8s overlapping fade — incoming and outgoing scenes' layers fade simultaneously, not sequentially. Current code prevents that.

**Fix.** Refactor so the fade is initiated synchronously and the layer is removed from the registry immediately; node teardown happens after the fade in a fire-and-forget tail. Add a `fadeAndDispose()` method to Layer.

**Cost.** ~30 min when we build the Scene transition coordinator.

### A3. Pink-noise normalization can momentarily clip [low priority — limiter handles it]
Voss-McCartney can produce sums up to ±17, divided by 8 = ±2.125. Above ±1.0 clips. The master soft limiter catches it transparently, but if anyone bypasses the limiter the synth bed will distort.

**Fix.** Divide by 16 instead of 8 (gives ±1.06, hands the last 0.06 to the limiter). Or apply a final tanh saturation in the worklet itself for guaranteed [-1, 1].

**Cost.** 2 minutes.

### A4. `dbPromise` caches a rejected promise on IndexedDB upgrade failure [low priority]
If the first openDb() fails (rare — quota/permission), every subsequent `getStory`/`saveStory` returns the same rejection forever.

**Fix.** Reset `dbPromise = null` in the rejection handler.

**Cost.** 5 minutes.

### A5. Stop button in the dev harness is unresponsive during fade-out [dev-harness only, irrelevant after Phase 3]
Tapping Stop on the FileLayer demo waits 5s before the UI updates. Looks like a hang.

**Fix.** Show a "Stopping…" state. Or just wait for Phase 3 — the real player has its own UX.

---

## B. Efficiency / cost wins

### B1. Pink-noise CPU
Voss-McCartney is already O(1) per sample. Combined with the `Math.random()` calls, two simultaneous noise layers (synth bed + tinnitus mask) costs ~1-3% CPU on a modern phone — fine. Worth measuring on an old iPhone before assuming.

### B2. AudioBuffer memory for the dev-harness test pad
Two 18s @ 48kHz stereo Float32 buffers = ~14 MB allocated when the user hits Play on the crossfade demo. Nontrivial. Once you stop, they're garbage collected — fine for dev harness; will go away in Phase 3.

### B3. Story generation cost (when we get to Phase 4)
Per generated 25-min story:
- Claude (script): ~6k input + 3k output tokens. With Sonnet 4.6 that's ~$0.05-0.10. Trivial.
- ElevenLabs v3 (synthesis): ~3,500 words ≈ ~22,000 characters. v3 multilingual pricing varies by tier; rough guess **~$1-3 per story** at v3 quality. **This is the dominant cost.**

**Implications.** Stories must be permanent assets (already in the brief). One generation per story ever. Library curation should encourage replay rather than regeneration. Surface this in UI: "Generated 4 days ago. Regenerate? (costs ~$2)".

### B4. iOS battery / wake-lock
For the 8-hour overnight case, the screen MUST sleep — that's actually what the user wants. We must NOT request wake lock by default. We must keep audio running while the screen sleeps. Visibility/focus handlers in AudioEngine handle this; iOS device testing required for verification (Phase 5).

### B5. Bundle size
167 kB JS, 53 kB gzipped. Great for v1. Will grow with Phase 3 UI components and Phase 4 ElevenLabs/Anthropic SDKs (those have bigger footprints — consider lazy-loading them only on the Settings/Library screens).

---

## C. Quality wins (small, cheap)

### C1. ✅ Soft cap of 6 layers — done in this review pass.

### C2. ✅ Top-level ErrorBoundary — done. Critical for "never white-screen at 3 a.m."

### C3. ✅ Spectrum visualizer in the dev harness — done. Verify noise colors visually.

### C4. ✅ SceneDefinition schema — sketched in `src/audio/sceneFormat.ts`. Phase 2 starts with shape settled.

### C5. Vitest setup
Pure functions worth testing right now: `crossfade.equalPower`, `ToneMatcher.sliderToHz`/`hzToSlider`, the Voss-McCartney bit-finding algorithm. Setup is ~15 min; first three tests are ~30 min. High value because these are the bits where a regression silently degrades audio quality and you wouldn't notice for weeks.

### C6. Audio quality soak test
A puppeteer/playwright script that runs the FileLayer for 3 hours capturing the analyser's spectrum every 10 seconds, looking for discontinuities. Makes the "8 hours, no audible seam" success criterion actually testable.

### C7. PWA manifest + icons
Icons in 192/512/maskable sizes, `manifest.json` with `display: 'standalone'`, theme color `#0B0D10`. ~30 min when you have the icon art.

### C8. `prefers-reduced-motion`
Honor the system setting. Easy CSS — disable transitions globally if reduced motion is requested. Brief's audience includes people sensitive to animation triggers.

### C9. Accessibility — slider ARIA labels
Range inputs need `aria-label`. Buttons need accessible names where the visible text is unclear (e.g. just "Stop").

### C10. Voice prompts as a dedicated file
Move the §6 voice descriptions out of the brief and into `content/voice-prompts.md` so the ElevenLabs Voice Design call can read them directly without copy-paste drift.

---

## D. Feature ideas / next-session candidates

Listed roughly in order of "what I'd do next":

### D1. Phase 2 — Multi-layer scenes
Build a `Scene` class that owns N layers, applies a master scene gain envelope, and coordinates the 8-second cross-scene fade. Define 2-3 scenes (Forest day, Rain on window, Beach gentle) as JSON files using the SceneDefinition schema I just sketched. Need real audio recordings sourced first — see D5.

### D2. Phase 3 — Tonight screen
The brief is firm: one primary action per view. Tonight = "Begin tonight's wind-down" tap, takes you straight to the last-played scene's player. Secondary affordances tucked away. House Blends are visual cards with soft photographic stills (NOT illustration — brief specifies "no loud wellness illustration"). I have opinions on this — let's talk before I commit code.

### D3. Player + Mixer
Player screen: timer chip, scene title, very dim chrome, big (44px+) play/pause. Mixer drawer: per-layer sliders + scene name + reset to scene defaults.

### D4. Lush vs Nightstand mode
Nightstand = full black, no controls visible; tap reveals dim controls for ~3 seconds. Implementation: a single React state toggle that swaps display modes; an idle timer auto-engages Nightstand after ~30s of no interaction.

### D5. Audio sourcing weekend
Pick 4-6 starter scenes. My recommendation:
- Forest day, Rain on window, Beach gentle, Fireplace (the "House Blends" most likely to actually be used)
- Source: Freesound CC0 first pass (free). If quality is wanting on the most-used 2 scenes, paid pack via SoundDogs or Pro Sound Effects ($20-50 budget).
- License notes saved alongside each recording in `public/audio/<scene>/<variant>.json` so we never lose attribution.

### D6. Story generation pipeline (Phase 4)
- **Claude prompt**: deliberately-dull arcs, 3000-3500 words, sprinkle `[whispers]` `[softly]` and pause markers. I should write the system prompt and a few-shot example that lock the tone.
- **ElevenLabs flow**: generate, save MP3 to IndexedDB, save metadata to localStorage. Background tab — story generation can take 60+ seconds.
- **Bring-your-own-key UI**: Settings has a paste-key field; feed-forward design so we can ship a static demo build later.

### D7. Pre-generated meditation library
Per the brief, meditations are pre-generated, NOT on-demand. Build a small CLI under `tools/` that I run on my own machine to generate meditations once and save the audio + metadata as JSON. Bundle them into `public/meditations/` so they ship with the app.

### D8. Surprise Me
Trivial once Phase 2 lands: random pick of 3-5 element layers across all scenes, with a brief volume balancing pass. Lightweight one-evening feature.

### D9. Soundscape narration
The §5.3 idea — voice describing the scene over the matching soundscape. I'd implement this as a story sub-genre, not a separate flow. Tag generated stories with `style: 'narration' | 'arc'` and let the prompt template branch.

### D10. Diagnostic page
Hidden settings option: "Show audio diagnostics" — current AudioContext state, current limiter reduction in dB, layer count, FileLayer scheduling lookahead time, browser detection. Useful when something doesn't sound right and we need to debug. Already 80% there with the harness; just needs to live behind a switch in the real Settings.

### D11. CI workflow
`.github/workflows/build.yml`: typecheck + build on PR. Catches regressions. ~15 min.

### D12. Dream mode (FUTURE — not v1, brief says skip)
Don't.

### D13. Sleep detection (FUTURE — not v1, brief says skip)
Don't.

---

## E. Open questions for you (recap from DECISIONS.md, prioritized)

1. **Phase 2 vs feedback first** — when you wake, want me to start Phase 2 (multi-layer scenes), or wait for you to listen to the harness and weigh in?
2. **Audio sourcing** — Freesound CC0 to start, paid pack later? OK to spend ~$20-50 on the most-used scenes once we know which ones?
3. **Howler for story playback in Phase 4** — yes/no?
4. **API key handling** — settings paste-field with localStorage now, or wait?
5. **Variant pool minimum** — enforce ≥2 variants per element, or allow single-variant layers?
