# Code Quality, Architecture & Technology Review — pre-v1.0

**Reviewer:** principal-engineer pass, 2026-06-12.
**Scope:** structure, technology choices, code quality, maintainability. (Runtime bug-hunting is a separate review; bugs here are incidental finds only.)

## Verdict — Grade: A−

This is an unusually disciplined codebase for a solo personal project. Module boundaries are real (audio engine knows nothing about React; screens never touch Web Audio nodes directly; storage is two small, swappable façades), the overnight-survival strategy is defense-in-depth rather than a single trick, TypeScript is on full strict, 138 tests pass, typecheck and production build are clean, and the comment culture is the best kind: comments explain *why*, cite incidents ("the 2026-06-11 overnight incident"), and document how to reject decisions (`DECISIONS.md`). The grade is held back from a clean A by a handful of concrete issues: a shipped scene that violates the project's own hard rule on prime loop offsets (`rain-on-window.json` uses 515), the synthetic-fallback dev convenience still enabled on production code paths where it can silently mask a broken deploy, a 1,063-line `App.tsx` that is two-thirds dev harness, some copy-paste drift (`resolvePublicUrl` reimplemented in `LibraryScreen`), dead code (`SpectrumAnalyser`), and UI↔engine state sync done by polling. None of these threaten The One Thing tonight; all of them are cheap to fix before v1.0.

---

## 1. Architecture

### Module boundaries — strong

The layering is genuinely clean and consistently respected:

- **`src/audio/`** is a self-contained engine. No React imports anywhere under it; its only outward dependencies are `diagnostics/lifecycleLog` (logging) and `lib/baseUrl` (URL resolution) — both justifiable. UI talks to it exclusively through `AudioEngine` / `SceneCoordinator` / `Scene` public methods.
- **`src/screens/`** never constructs Web Audio nodes. PlayerScreen drives the engine via `coordinator.getCurrentScene()`, `scene.setLayerVolume()`, `engine.bus.setMasterVolume()` — the right altitude.
- **`src/storage/`** is two deliberate façades: localStorage blob for settings (`settings.ts:14`, versioned key `sleep-app:settings:v1`, merge-with-defaults migration at `settings.ts:104`) and IndexedDB for large audio (`assets.ts`, metadata and bytes in separate stores so listing is cheap — documented at `assets.ts:12`). The debounced write + `pagehide` flush (`settings.ts:69–102`) is a thoughtful touch.
- **`src/services/storyGenerator.ts`** is pure pipeline logic with zero UI coupling; ~25 exported pure helpers make it the most heavily tested file in the repo (67 test cases).

One boundary wart: the **singleton accessors take arguments they ignore after first call**. `getSceneCoordinator(engine)` (`SceneCoordinator.ts:377`) captures `engine` on first call; a later call with a different engine silently returns the old coordinator. It works today because `getAudioEngine()` is also a singleton, but the signature lies. Nice-to-have: drop the parameter and have it call `getAudioEngine()` internally.

### State management — appropriate, with one smell

No Redux/Zustand/Context — plain `useState` + prop callbacks + module singletons. For 6 screens and a screen-enum router in `App.tsx:55–62`, this is the right call; a state library would be ceremony.

The smell: **UI mirrors engine state by polling**. `PlayerScreen.tsx:215–222` polls `coordinator.getCurrentScene()` every 500 ms; the harness polls layer volumes every 250 ms (`App.tsx:768–775`); mixer slider changes force re-render via a `setTick((t) => t + 1)` counter (`PlayerScreen.tsx:443`, also `App.tsx:931`). The engine already has a listener system (`AudioEngine.addListener`, `EngineEvent`) — `SceneCoordinator` just doesn't emit a `scene-changed` event. Should-fix (cheap): add one event kind and replace the 500 ms interval with a subscription. Not because polling is broken — because the half-second lag between engine truth and UI is the kind of thing that breeds "why does the player flash the old scene" bugs later.

### Audio lifecycle & cleanup — excellent

This is the strongest part of the codebase.

- **FileLayer chain-timer/pipeline** (`FileLayer.ts:88–298`): the design is correct and well-defended. `LOOKAHEAD_COUNT = 3` pre-fills iterations locked to the audio clock (`source.start(t)`), so the main thread is only needed once per iteration to top up the tail. `pipelineTail` (`FileLayer.ts:118`) decouples chaining from `liveSources` (whose entries are removed by `onended`), and `lastHandledStartTime` (`FileLayer.ts:125`) prevents double-fires from extending the pipeline unboundedly. The drained-pipeline recovery path (`FileLayer.ts:288–295`, `Math.max(nextStart, now + 0.01)`) degrades to an audible-but-recoverable seam instead of throwing. The 38-line file-header comment plus the CLAUDE.md invariant ("never remove `pipelineTail` or `lastHandledStartTime` without reading the chain-timer design") is exactly how a fragile invariant should be guarded.
- **Disposal discipline**: every layer implements `stop()` (await fade) *and* `fadeAndDispose()` (fire-and-forget, for overlapping cross-scene fades), and `dispose()` is idempotent with try/catch around every `disconnect()`. `FileLayer.scheduleFadeOut` (`FileLayer.ts:362–374`) deliberately ramps the layer master instead of per-iteration gains to avoid `setValueCurveAtTime` conflicts — with the reasoning written down.
- **Context-loss recovery** is a standout: `AudioEngine.recreateContext()` (`AudioEngine.ts:385–427`) rebuilds a dead AudioContext; the watchdog (`AudioEngine.ts:510–539`) catches the "zombie" state — `state === 'running'` with frozen `currentTime` — via two stagnant 2 s ticks, rate-limited by `RECREATE_MIN_INTERVAL_MS`; `SceneCoordinator.restartAfterContextLoss()` (`SceneCoordinator.ts:233–264`) rebuilds the current scene from its definition and handles the user-acted-meanwhile race (`SceneCoordinator.ts:247–251`). The dead scene is intentionally kept in `currentScene` during rebuild so polling UIs don't bounce the user out — subtle and documented.

### SceneCoordinator / Scene design — clean

`Scene` is a layer-of-layers with a single scene-level `GainNode` so the 8 s crossfade is one AudioParam ramp (`Scene.ts:9–13`); it deliberately bypasses the engine's layer registry, with the cap enforced locally (`Scene.ts:32`, `SCENE_LAYER_CAP = 6`). Two small wrinkles:

- The cap constant is duplicated: `Scene.ts:32` and `AudioEngine.LAYER_SOFT_CAP` (`AudioEngine.ts:50`) are both `6` with no shared source. Nice-to-have: export one.
- Because Scene bypasses the registry, `AudioEngine.hasActiveSession` had to grow a keep-alive-based heuristic (`AudioEngine.ts:369–371`) — correctly reasoned, but it means "is anything playing" has two sources of truth. Documented, acceptable.
- `loadScene` decodes element variants serially per element (`SceneCoordinator.ts:135–145` — `await` inside the `for` loop) even though variants *within* an element load in parallel. A 4-element scene pays 4 sequential round-trip batches. Nice-to-have: `Promise.all` over elements too.

### Error handling & ErrorBoundary — fit for purpose

`ErrorBoundary.tsx` is minimal and correctly aimed at The One Thing: the fallback says "Audio may still be playing. Tap to reload only when you're ready" (`ErrorBoundary.tsx:42–44`) — it does not auto-reload, because the audio graph lives outside React and survives a render crash. Error taxonomy elsewhere is genuinely good: `AudioLoadError` with a `kind` discriminant (`FileLayer.ts:452–464`) so only 404s are synth-substitutable; `describeGenerationError` (`StoryGeneratorScreen.tsx:47–58`) maps TimeoutError/TypeError/AbortError to calm, actionable copy; `fetchWithTimeout` (`storyGenerator.ts:639–678`) merges external abort + timeout onto one controller and normalizes engine quirks.

One must-fix-adjacent item: **the synthetic-fallback dev convenience is still on in production paths**. `TonightScreen.tsx:81` and `ContentPlayerScreen.tsx:163` pass `fallbackToSynthetic: true`, and `LoadSceneOptions` defaults to `true` (`SceneCoordinator.ts:99`). The option's own doc says "Set false in production builds once recordings exist" (`SceneCoordinator.ts:53`) — recordings now exist. A renamed file or bad deploy 404 will silently play a synthesized test pad at 3 a.m. instead of rain, which is arguably worse than failing loudly at scene start. Flip the default to `import.meta.env.DEV`, or at least surface the `fallback-synthetic` outcome in the Player UI.

### Surviving the night — defense-in-depth, well-reasoned

The strategy is seven independent layers, each with its rationale written down: audio-clock pipeline scheduling (FileLayer), silent keep-alive loop through the bus (`silentKeepAlive.ts`), `<audio>`-element sink for Chrome's "playing media" protection (`AudioEngine.engageElementSink`, `AudioEngine.ts:302–334`, with autoplay-refusal fallback and element reuse to keep autoplay trust), MediaSession metadata + handlers (`mediaSession.ts`), screen wake lock with re-acquire-on-visible (`useWakeLock.ts`), SW ping keep-alive (`serviceWorker/keepAlive.ts`), and the resume/zombie watchdogs. The lifecycle log (`diagnostics/lifecycleLog.ts`) closes the loop — capped at 500 entries, installed before first paint (`main.tsx:16`), exportable from Settings. The git log shows this whole subsystem was built by post-incident iteration, and the code reads that way (in the good sense).

The service worker (`public/sw.js`) is correct on the points that matter: no `skipWaiting()` so a deploy never takes over a playing session (`sw.js:72–75`), cache-first audio with explicit refusal to cache 206 partials (`sw.js:158–163`), scope-derived `BASE` so the same file works at any deploy base, and a build-time precache injection plugin (`vite.config.ts`, `swPrecachePlugin`) with per-URL best-effort install. Hand-rolled rather than Workbox — at ~200 commented lines for a single-user app, that's the right trade.

---

## 2. Technology choices

### React 18 + Vite + Tailwind — right-sized

- React's job here is six screens of forms and sliders; the audio engine is framework-free, so the React dependency is shallow and replaceable. Fine.
- Vite config is unusually production-aware for a personal project: tailnet dev-HTTPS story, strictPort with reasoning, test-file watch exclusion *so a test edit doesn't reload the app and kill a playing session* (`vite.config.ts`, `server.watch.ignored`) — that last one is The One Thing showing up in tooling config.
- Tailwind with a small custom theme (ink/stone/moon/ember palette, `duration-slow`, `ease-exhale`) matches the design brief. Styling is consistent across screens; the button-tier decision is recorded in `DECISIONS.md` (2026-05-31 addendum).

### Howler — **not vestigial; correctly scoped**

`Howl` is used exactly once, in `ContentPlayerScreen.tsx:88` with `html5: true` for long-form story/meditation playback (streaming, iOS background, OS media treatment) — precisely the use DECISIONS.md §1/§Q4 reserved it for. It's lazy-loaded: `App.tsx:34–49` code-splits all post-Tonight screens, so Howler's ~30 kB lands in the `ContentPlayerScreen` chunk (43 kB raw, 12.3 kB gz) and a user who only plays scenes never downloads it. Keep it. (Honest alternative: a bare `<audio>` element could do this job and drop the dependency — but Howler's iOS hardening is genuinely useful and the cost is isolated. Not worth churning before v1.0.)

### Dependencies — admirably few; one notable absence

Three runtime deps (react, react-dom, howler). Nothing to remove. One to consider **adding: ESLint**. There is no ESLint config in the repo, yet the code carries `eslint-disable-next-line` comments (`App.tsx:130`, `PlayerScreen.tsx:212`, `offlinePrecache.ts:141`) — dead annotations from an editor-side or former setup. For a codebase whose worst enemy is an unawaited promise or a stale-closure effect dep, `typescript-eslint` + `eslint-plugin-react-hooks` is the highest-value tooling gap. (The two `react-hooks/exhaustive-deps` suppressions I checked are deliberate and correct — but right now nothing enforces the rule anywhere else.)

### TypeScript strictness — full marks

`tsconfig.json`: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`. `exactOptionalPropertyTypes` is explicitly off (line 21) — a reasonable comfort trade-off. Code style backs it up: discriminated unions for UI state (`TimerMode`, `PlayerScreen.tsx:46–50`; `GenerationStep`), `unknown`-typed error plumbing, no `any` to be found, typed wrappers around non-standard APIs (`NavigatorWithWakeLock`, `useWakeLock.ts:33`). The `Uint8Array<ArrayBuffer>` note in `Analyser.ts:14–17` shows the strictness is maintained, not inherited.

### Verification runs (this review, honest results)

| Command | Result |
|---|---|
| `npm run typecheck` | clean, 0 errors |
| `npm test` | **10 files, 138 tests, all pass** (8.5 s; two benign jsdom "HTMLMediaElement not implemented" warnings) |
| `npm run build` | clean; `tsc` then Vite, 69 modules |

Bundle (gzip): main `index` chunk **63.8 kB**, CSS 4.3 kB, lazy chunks: ContentPlayer 12.3 kB (Howler), StoryGenerator 6.7 kB, Settings 4.1 kB, Library 2.4 kB. Initial load ≈ 70 kB gz — excellent for a PWA; no build warnings; sourcemaps on.

---

## 3. Code quality

### Dead code

- **`src/audio/Analyser.ts` (`SpectrumAnalyser`) is fully dead** — zero imports anywhere; the harness spectrum draws from `engine.bus.analyser` directly (`App.tsx:426`). Must-fix (trivial): delete it, or wire the harness through it.
- **TinnitusMaskLayer — judged on isolation, per the brief: well-shelved.** The engine class (`TinnitusMaskLayer.ts`) stays live because scene JSON may declare `tinnitus.enabledByDefault` (`SceneCoordinator.ts:121–129`); the UI is behind `SHOW_TINNITUS_HARNESS = false` (`App.tsx:69`) and the save flow is stubbed with a comment (`App.tsx:395`). The only cost of the shelving is that `ToneMatcher` + the two harness sections are bundled into the main chunk despite being unreachable; acceptable.
- The eslint-disable comments noted above are dead annotations until ESLint exists.

### Duplication

- **`resolvePublicUrl` is reimplemented privately in `LibraryScreen.tsx:23–26`**, character-identical to `src/lib/baseUrl.ts:7–10`, which exists precisely to be shared. Should-fix: import it. This is the exact bug-breeding pattern the GitHub-Pages base-path comment in `SceneCoordinator.ts:297–301` warns about.
- Layer lifecycle boilerplate (`fadeAndDispose` / `setVolume` ramp / try-catch-disconnect `dispose`) is structurally repeated across `FileLayer`, `TinnitusMaskLayer`, `NoiseGenerator` (~40 lines each). A `BaseLayer` could absorb it; with only three implementations this is nice-to-have, not debt.
- `SCENE_LAYER_CAP` vs `AudioEngine.LAYER_SOFT_CAP` (both 6) — see §1.
- "Surprise me" logic appears twice (`TonightScreen.tsx:96–102`, harness `App.tsx:836–842`) — harness copy, ignorable.

### Oversized files

- **`App.tsx` (1,063 lines) is the one real offender** — but ~700 of those lines are the dev `Harness` and its sections (`App.tsx:348–1063`). The actual app shell is ~210 tidy lines. Should-fix: move `Harness` to `src/screens/HarnessScreen.tsx` (or better, lazy-load it like the other secondary screens — it's currently in the main bundle every night). `storyGenerator.ts` (1,062 lines) is long but well-sectioned with banner comments and mostly pure functions; splitting it would hurt more than help. `PlayerScreen.tsx` (686) is at the edge but coherent.

### Naming, comments, magic numbers

- Naming is consistent and honest throughout (`fadeAndDispose` vs `stop`, `pipelineTail`, `bedKeepsScreenLive`, `verifyContextAlive`).
- Comment quality is the best I've seen in a project this size: rationale-bearing (`silentKeepAlive.ts:1–19`), incident-citing (`AudioEngine.ts:503–509`), load-bearing-marked (`AudioEngine.ts:151–157` on the worklet-promise cache clear). `DECISIONS.md`'s "How to reject this" format is a model.
- Magic numbers are almost universally named and justified: `RESUME_TIMEOUT_MS`, `LIVENESS_PROBE_MS`, `RECREATE_MIN_INTERVAL_MS` (`AudioEngine.ts:24–32`), `IDLE_TIMEOUT_MS`/`WAKE_DURATION_MS`/`TIMER_FADE_SECONDS` (`PlayerScreen.tsx:35–39`), `NIGHTSTAND_FADE_MS` with feel-rationale (`PlayerScreen.tsx:507–511`), the TTS/normalization constants with dB math (`storyGenerator.ts:58–109`). Residual stragglers: the `+ 100` ms chain-timer pad (`FileLayer.ts:279`), `+ 0.05`/`+ 0.1` stop-tail pads scattered through fades, the `(TIMER_FADE_SECONDS + 0.6)` exit pad (`PlayerScreen.tsx:238`). Nice-to-have only.

### Scene data vs. the project's own hard rules — one violation

CLAUDE.md: "Each element MUST use a different loop offset, picked from `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS` (251, 409, 521, 691, 887). Off-list values are wrong even if they're close to a prime."

- **`public/scenes/rain-on-window.json:37` — `rain-pavement` uses `loopOffsetSeconds: 515`.** 515 = 5 × 103; it's not on the list (almost certainly a typo for 521). It happens to be coprime with its siblings 251 and 409, so the audible harm is nil, but it violates the stated contract, and nothing enforces the contract: `sceneFormat.test.ts` doesn't validate shipped JSON against the prime list. Must-fix: change to 521 **and** add a test that loads every `public/scenes/*.json` and asserts (a) every offset ∈ the canonical list, (b) offsets are distinct per scene, (c) ≥ 2 elements per scene. All eight shipped scenes pass (b) and (c) today; only this value fails (a).
- Doc drift, same file: the `SceneElementDefinition.loopOffsetSeconds` doc comment still suggests the *old broken* values "253 (4:13), 407 (6:47), 511 (8:31)…" (`sceneFormat.ts:52–55`) that the constant below it explicitly repudiates (`sceneFormat.ts:87–89` explains 253 and 407 share gcd 11). A scene author reading the field doc instead of the constant gets the wrong numbers. Should-fix: update the comment to reference the constant.
- Minor: `forest-day.json` `creek-trickle` has a single variant (the engine allows it; brief says 2–4). Worth a TODO, not a blocker.

### Consistency between screens — good

All six screens share the same skeleton (max-w-md container, serif `<h1>` header, `body-text`/`ui-label` type classes, `minHeight: 44` on every interactive element — checked, it's genuinely everywhere), the same back-link idiom, and the same error-copy tone. Accessibility effort is consistent and above-baseline: `aria-valuetext` on sliders, `aria-pressed` on toggles, colorblind-aware status text with explicit "never colour alone" comments (`PlayerScreen.tsx:560–563`, `620–623`). The keep-alive trio (wakeLock + engine keep-alive + SW ping) is correctly mirrored between PlayerScreen (`PlayerScreen.tsx:149–160`) and ContentPlayerScreen (`ContentPlayerScreen.tsx:226–241`) with the content variant's extra `bedKeepsScreenLive` condition documented against the incident it fixes.

---

## 4. Testing & tooling

- **What's tested is the right stuff**: the engine invariants (FileLayer pipeline depth, chain-timer top-up, fade scheduling — `FileLayer.test.ts`; context recreation, watchdog, layer cap — `AudioEngine.test.ts` 15 cases; crossfade math; scene-restart-after-context-loss — `SceneCoordinator.test.ts` 12 cases) and the pure story-pipeline helpers (67 cases covering chunking, WAV headers, RMS normalization, marker stripping, Projects polling). The hand-rolled `src/test/audioMock.ts` (422 lines) is a serious piece of infrastructure that makes scheduling assertions possible.
- **What's not tested**: any screen. Zero component tests despite `@testing-library/react` being installed. For a solo personal app this is a defensible economy — the screens are thin — but the most complex screen logic (PlayerScreen's timer/fade/exit state machine, `PlayerScreen.tsx:225–269`) is exactly the kind of interval-driven code that regresses silently. Should-fix: one fake-timer test for the timer→fade→exit path; skip the rest.
- **No CI gate visible in repo** (`.github/` exists; I did not audit workflows) — `build` runs `tsc` first, so the build is its own typecheck gate. Fine.
- Missing ESLint: see §2.

---

## 5. Maintainability for a solo developer

**Yes — this is keepable-alive by one person**, and that's clearly been a design goal. The things that make it so: the written-down decision trail (`DECISIONS.md`, CLAUDE.md invariants, incident notes in comments), small dependency surface (3 runtime deps; hand-rolled SW instead of Workbox; no state library), build-id stamping into the lifecycle log for "did the phone run the new code" forensics (`main.tsx:20`, `SettingsScreen.tsx:188`), and the diagnostics export flow built into Settings.

What's fragile, in order:

1. **The platform-workaround stack** (element sink, zombie watchdog, keep-alive trio) is calibrated against *current* Chrome/Android/iOS heuristics and will silently rot as browsers change. Mitigation already exists (lifecycle log); accept and monitor.
2. **Unenforced scene-authoring contract** — the 515 case proves the docs-only rule fails in practice. The proposed JSON-validation test converts the contract from prose to CI.
3. **Polling-based UI sync + `setTick` re-render hacks** — works, but every new screen that observes the engine will copy the pattern. One `scene-changed` event fixes the root.
4. **`tools/` duplication with src** — `stripStoryMarkers` is hand-mirrored with `tools/gen-story.ts` ("keep in sync" comment, `storyGenerator.ts:565`). Classic drift risk; consider importing one from the other or moving the helper to a shared module.
5. **Harness in the main bundle** — every byte of dev-only UI ships to the phone and to the bedside; also the only screen reachable from prod UI ("Dev tools" footer, `TonightScreen.tsx:172–180`) that can throw `LayerCapExceededError` into the user's face.

---

## Recommendations, ranked

### Must-fix (before v1.0)
1. **`public/scenes/rain-on-window.json:37`** — change `515` → `521`; it's off the canonical prime list (CLAUDE.md hard rule).
2. **Add a scene-JSON conformance test** (offsets ∈ `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`, distinct per scene, ≥ 2 elements, volumes within voicing bands) so the contract is enforced, not narrated.
3. **Stop defaulting `fallbackToSynthetic: true` on production paths** (`SceneCoordinator.ts:99`, `TonightScreen.tsx:81`, `ContentPlayerScreen.tsx:163`) — gate it on `import.meta.env.DEV` or surface the fallback state in the Player. A 404'd deploy should not whisper a test pad all night.
4. **Delete dead `src/audio/Analyser.ts`** (zero references).

### Should-fix
5. Extract the ~700-line `Harness` from `App.tsx` into its own lazy-loaded module.
6. `LibraryScreen.tsx:23` — import `resolvePublicUrl` from `lib/baseUrl` instead of the private copy.
7. Fix the stale doc comment in `sceneFormat.ts:52–55` still recommending the broken 253/407/511 offsets.
8. Add ESLint (`typescript-eslint` + `react-hooks`) — the disable comments imply it; nothing enforces it.
9. Emit a `scene-changed` engine/coordinator event and replace the 500 ms polling in `PlayerScreen.tsx:215–222`.
10. One fake-timer test for PlayerScreen's timer→fade→exit state machine.

### Nice-to-have
11. Unify `SCENE_LAYER_CAP` / `AudioEngine.LAYER_SOFT_CAP`.
12. Parallelize per-element variant loading in `SceneCoordinator.loadScene` (`Promise.all` over elements).
13. Drop the ignored `engine` parameter from `getSceneCoordinator()` or make it honest.
14. Share `stripStoryMarkers` between `src/services/storyGenerator.ts` and `tools/gen-story.ts`.
15. Second variant for `forest-day` creek-trickle; name the residual `+0.05/+0.1/+100ms` scheduling pads.
