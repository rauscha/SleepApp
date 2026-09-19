# Claude Code instructions for this project

SleepApp is a personal sleep PWA for one user. **The One Thing: put me to
sleep and let me stay there.** Everything below serves that.

---

## Where the project is (2026-09-19)

A v1.0 ship candidate. The overnight-survival problem that gated v1.0 is
solved — the scene bed runs on native Howler `html5` and was confirmed over a
real 6h overnight (see "Audio engine invariants").

- **9 scenes ship**, 1 is held back. 4 bundled stories, 3 meditations
  rendered, 7 meditation scripts written and unrendered.
- **No generative AI at runtime.** The in-app story generator was stripped on
  2026-09-15; the library is fixed files in `public/`. See "The library is
  hand-made".
- **What is actually left before tagging v1.0:** a narration voice (blocked on
  Andrew's ear — the audition is on his phone), the 7 unrendered meditations
  behind it, a replacement bed for the held-back singing-bowl scene, a photo
  for `night-train`, and a device pass.

**The live checklists are in `.handoff/`, not here.** `PENDING-DECISIONS.md`
is what is open and who it is waiting on; `SESSION-HANDOFF.md` is newest-block
-first state. Read both before starting work. This file is the rules; those
are the situation.

---

## Before you touch anything

**Read the decision history before changing content, not after.** This repo
carries fifteen months of decisions in `DECISIONS.md`, `.handoff/`, and
`notes/`, and they are load-bearing. On 2026-09-15 a session spent an hour
perfecting the loop seams on the singing-bowl scene; the decision to throw
that audio away wholesale had been on record since 2026-06-21, in two
places, one of which said "Singing-bowl: replace, don't re-cut." Measurements
told a clean story and the history said the work was pointless. **Grep the
history for the thing you are about to change.** A good seam on rejected
audio is still rejected audio.

---

## Commit discipline

- **Work directly on `main`. Do NOT open pull requests.** (Andrew,
  2026-09-11.) This overrides the global instruction that unattended work
  stops at a pushed branch + PR — a reasonable default for shared repos and
  pure friction on a solo project. Commit to `main` and push. The safety net
  is the discipline below, not a review gate.
  - A short-lived branch is fine for genuinely risky or exploratory work you
    expect to throw away, but merge it yourself when it is green rather than
    leaving a PR for Andrew to click.
- One logical change per commit. Typecheck + tests green before each.
- Follow the existing message style (`git log --oneline`): short imperative
  subject, a body that explains what changed and **why** well enough to revert
  from, a `Validated:` line, and the `Co-Authored-By` trailer.
- **`deploy.yml` publishes to GitHub Pages on every push to `main`.** A push
  is a deploy. That is also why a `CACHE_VERSION` bump is not free — see
  "Cache version".
- Never commit `.env` or credential files.

## Worktrees — the real invariant is "committed and pushed on main"

This repo lives on Google Drive, which holds file handles open inside
`.git/worktrees/` and `.claude/worktrees/`. So:

- **`git worktree prune` / `rm -rf` on those dirs will fail with "Permission
  denied", and that is EXPECTED.** Every git op prints ~16 lines of permission
  spam. It is cosmetic. Commits and pushes still succeed.
- **What matters: is the work committed and pushed to `origin/main`?** If yes,
  stranded worktree state, dangling commits and leftover `claude/*` branches
  are litter, not lost work. Verify with `git worktree list` (should show only
  `main`) and `git rev-list --left-right --count origin/main...HEAD` (0 0).
- **Keep notes about where you left off** instead of forcing a clean tree.
- **Don't attempt worktree cleanup unprompted.** Save it for when Andrew asks
  for "deferred clean-up work" — that is the signal to pause Drive sync, then
  `git worktree prune` + `rm -rf .claude/worktrees/* .git/worktrees/*`.

## After completing any step

If `NEXT_STEPS.md` exists at the repo root, update it before committing — mark
the finished item done and adjust priorities if the work surfaced new tasks.
When present it should reflect the actual current state, not a stale snapshot.
It is gitignored (personal working notebook), so skip this in a fresh clone
that does not have one.

---

## Design constraints (from the brief)

- **The One Thing:** put me to sleep and let me stay there.
- No alarm, no notifications, no telemetry, no accounts, no onboarding wall.
- UI: Midnight Editorial Minimalism — deep/dark, warm stone, editorial serif
  headings, moonlit sage accent. **Photography, not illustration.** No loud
  wellness iconography.
- Body text minimum 16px. Touch targets minimum 44×44px.
- Tinnitus features are shelved — keep the engine, hide the UI.

## The library is hand-made, not generated

Andrew, 2026-09-12: this "really needs to be a dead simple straightforward APP
of an app, not something where we've bolted on gen AI cause its cool".
Executed 2026-09-15 (DECISIONS.md, "The library is hand-made, not generated").

- **Nothing in the browser calls an AI service.** The app fetches JSON indexes
  and audio from its own origin and nothing else. There are no API-key fields
  and no `VITE_*` key variables. Do not reintroduce either.
- Stories and meditations are files under `public/stories/` and
  `public/meditations/`, listed in an `index.json` beside them.
- **Adding content is a desk-side job:** run `tools/gen-story.ts` or
  `tools/gen-meditation.ts` (Node; they read `ANTHROPIC_API_KEY` and
  `ELEVEN_LABS_API_KEY` unprefixed from `process.env`, never through Vite) and
  commit the output. That is deliberate — it makes the narration voice a
  per-file choice instead of whatever the phone was configured with.
- `dropGeneratedStoryDatabase()` in `src/storage/persistence.ts` deletes the
  old IndexedDB on every launch. Deleting an absent database succeeds, which
  is what makes that safe; leave it.

---

## Scene authoring — READ THIS BEFORE TOUCHING SCENES

### The incommensurate-loops rule

Scenes feel alive instead of loopy because of **pairwise-coprime loop offsets
across layered elements** — Brian Eno's *Music for Airports* technique. The
combined pattern only repeats at the LCM of the per-element offsets, which for
the canonical primes is tens of hours. Lose that and the scene sounds like a
tape loop within ten minutes. This is core audio design, not an implementation
detail.

**Hard rules for any scene JSON in `public/scenes/`:**

1. **At least 2 layered ambient `elements`, ideally 3–4.** A scene that is
   just `synth` + one element is a bug and **must not be committed**. If the
   source audio only supports one layer, **hold the scene back** rather than
   shipping it thin (see "Holding a scene back").
   Aim for **2+ variants per element** too, so `variantRotation` has something
   to rotate. This is a target rather than an enforced rule, and there is one
   known miss: `waterfall-valley/falls-main` ships a single variant.

2. **Each element uses a different offset from
   `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`** in `src/audio/sceneFormat.ts` —
   currently **199, 251, 409, 521, 691, 887**, all true primes, pairwise
   gcd 1. Off-list values are wrong even when they are "close to a prime".
   Need a seventh? Add another true prime to that list; do not improvise.
   `src/audio/sceneCatalogue.test.ts` enforces this, but sanity-check by eye —
   a shipped off-list 515 survived weeks before four independent reviewers
   caught it.

3. **Every variant file's length must EQUAL its element's
   `loopOffsetSeconds`** (±2.5s encode slack). Under the Howler `html5` engine
   each layer loops the whole file natively — **the file is the loop**. Don't
   hand-trim: run `tools/loopify-scenes.py`.

4. **Voice the stack like a mix,** not a flat sum: closest/primary element
   ~0.55–0.60, supporting layers 0.25–0.35, sparse event layers (distant
   thunder, occasional dockside) ~0.18–0.20 on a long mostly-silent loop, and
   the synth bed under it all at ~0.10–0.16 to glue the spectrum.
   - **Every layer declares a `maxVolume` ceiling** (2026-09-12): the Mixer
     slider's travel maps onto `[0, maxVolume]` instead of `[0, 1]`.
     `defaultVolume` is still the real gain and a ceiling never changes how a
     scene sounds — it stops three quarters of each slider being levels nobody
     would choose. Rule: **2× the voiced default, capped at 1.0**. Departures
     need a reason (forest-night's `night-ambience` is 0.22/0.60 — Andrew
     found the crickets hot and would never go past 0.6).
   - **Within the ceiling sliders are tapered, not linear**
     (`src/audio/taper.ts`): constant dB per unit of travel. Stored values —
     scene JSON, saved Mixer levels, settings, marker logs — are all still real
     gain; the taper converts only where a slider is drawn or dragged. Any new
     volume slider uses `gainToTaper`/`taperToGain`, never raw gain.
   - The synth bed is a pre-rendered 887s noise loop
     (`public/audio/_bed/<color>.opus` — coprime to every element offset) that
     `HowlScene` plays as a quiet native layer under every scene, not a live
     `NoiseGenerator`.

### Cutting the loops: `tools/loopify-scenes.py`

Idempotent. Trims every variant to its element's offset with a gapless 6s wrap
and renders the synth beds. **Re-run it any time you add or change scene
audio**, then `sceneCatalogue.test.ts` verifies every file landed on its prime.

- **It does not trim from t=0** (2026-09-02). `tools/seamfit.py` searches the
  start offset S whose wrap is level-matched and flattens the residual with a
  gain tilt, so a raw recording's fade-in no longer lands a 10–17 dB step on
  the wrap every P seconds all night.
- **Give the search slack.** The whole search range is
  `sourceDuration - loopOffset - 6`. Under about 30 seconds it cannot beat a
  slow swell, and you get a stepped wrap no matter how good the recording is —
  this is what put a 19 dB step in a shipped file for months. Check the slack
  *first* when a seam is bad; only then blame the source.
- `python tools/loopify-scenes.py --audit` measures the wrap step of every
  shipped variant read-only. Anything over 3 dB wants a re-cut.

### Format

**Scene audio ships as Opus, not MP3** (2026-06-30; DECISIONS.md). MP3's
~16kHz lowpass strips the noise "air" that matters for this material.
`loopify-scenes.py` always emits `.opus` — feed it any format and it converts
and rewrites the scene JSON's variant URLs in place. libopus only encodes at
8/12/16/24/48kHz, so the pipeline targets **48000 Hz** throughout. **The
migration is complete** — all 74 scene variants are Opus and none are MP3.
`sceneCatalogue.test.ts` and `HowlScene`'s Howler `format` list still accept
`.mp3`, harmlessly; narration under `public/stories/` and
`public/meditations/` is still MP3 and is a separate question.

### Preparing source audio

- **`tools/level-ftus.py`** levels a multichannel master into a stereo scene
  source (front pair → `dynaudnorm` → two-pass linear `loudnorm` → 48 kHz WAV
  + sidecar). **FTUS encodes the channel layout in the filename prefix** —
  `TRNInt-L,R_` is stereo, `TRNInt-M,S,Cs_` is mid/side, `TRNInt-W,Y,Z,X_` is
  first-order ambisonic B-format. Pass `--layout {front-pair,ms,ambix}`
  accordingly; feeding a B-format file through `front-pair` puts the omni in
  one ear and a figure-8 in the other. `--balance` corrects a standing L/R
  difference, which matters for a bed someone sleeps under all night.
- **`tools/build-sparse-event-layer.py`** assembles a mostly-silent event
  layer — a few clips dropped into silence, low-passed, then **one fixed
  gain**. Never `loudnorm` a mostly-silent track; in a single pass it runs
  dynamic mode and pumps.
- **`tools/scan-tonal-events.py`** finds narrow tonal intrusions (birds,
  voices) in broadband beds. It flags candidates, it does not judge them — a
  fire crackle and a gull both look narrow, and in a train cabin the metallic
  events *are* the material. **Also transcribe with faster-whisper + VAD
  before shipping a bed**: a voice returning every 251s all night is the
  failure mode that measurement alone will not catch.

### Holding a scene back

A scene that is written but not fit to ship goes in
`public/scenes/_held-back/`, out of `index.json`. Nothing globs that directory
— not `sceneCatalogue.test.ts` (`/public/scenes/*.json`), not
`loopify-scenes.py`, not the app. A `_heldBack` key in `index.json` carries
the note (JSON has no comments) and a README beside the scene carries the
reasoning. Moving the file back and restoring one index entry un-holds it.
`singing-bowl` is held back as of 2026-09-16, pending a source for its
replacement bed.

### Cache version

`CACHE_VERSION` in `public/sw.js`. **Bump it when audio bytes change**, never
casually: `/audio/` is cache-first, so a bump makes every install re-download
the whole catalogue (~430 MB), and a push deploys immediately. Adding new
files needs no bump — a cache-first miss fetches them. `index.json` is
stale-while-revalidate and refreshes on its own.

---

## Audio engine invariants

**The production scene bed runs through Howler `html5` (`src/audio/howl/`),
not Web Audio.** The 2026-06-15 pivot (DECISIONS.md): routing a Web Audio bus
into an `<audio>` element via `MediaStreamAudioDestinationNode` is explicitly
unsupported (W3C #2293) — on Chromium the element's `currentTime` never
advances and the OS freezes the tab ~90s after screen-off. That was the
overnight death we chased for days. No watchdog beats a primitive the browser
suspends by design. The fix lets the OS own each loop, exactly like
Spotify/Calm/YouTube.

- **`HowlScene`** plays one looping `Howl({ html5: true })` `<audio>` element
  per layer, plus the synth-bed carrier. **The element loops itself —
  `loop: false` plus `node.loop = true`, NOT Howler's `loop: true`**
  (2026-09-11). Howler's own loop restarts the element from a JS timer and
  measured **27 ms of silence at every wrap** against 3.3 ms for a native
  loop, landing right where the gapless wrap can't cover it. Don't "simplify"
  this back. Two invariants come with it: the factory's `unload()` must clear
  `node.loop` before the element returns to Howler's shared pool (it is never
  reset on reuse, so a story's narration would inherit it and repeat all
  night), and `applyNativeLoop` must keep its fallback to Howler's loop if it
  cannot reach the element. Re-run `tools/loop-probe/run.sh` after any Howler
  upgrade. `HowlScene` exposes the same surface PlayerScreen read off the old
  Web Audio `Scene`, so the UI was untouched by the pivot.
- **`HowlScenePlayer`** (`getHowlScenePlayer()`) is the playback session —
  `startScene`/`crossfadeTo`/`stopScene`/`getCurrentScene`/`sleepTimer`/
  `setSceneResolver`. Scene crossfade defaults to 8s. Tonight, App, Player and
  ContentPlayer all point here.
- **No keep-alive stack on this path.** Because the OS owns each looping
  element there is no MediaStream sink, silent keep-alive, zombie watchdog or
  `recreateContext` on the bed. Don't reintroduce them — they were treating
  symptoms of the unsupported construct above.
- **Overnight protections are owned by the session, not a screen.**
  `HowlScenePlayer` owns the sleep timer, Night Drift, the OS media session
  and the SW keep-alive ping; they live and die with the scene, never in a
  React unmount cleanup. A screen exit while audio plays must strip nothing.
- **Overlapping starts serialize to one winner** via `startGeneration` — a
  superseded build is `dispose()`d, not started.
- **Debug markers are session-owned too** (2026-09-11).
  `HowlScenePlayer.markMoment()` records what every layer is playing and where
  it is inside its loop; store in `src/diagnostics/markers.ts`, desk-side
  review in `tools/review-markers.py`, behind the `debugMarkers` setting
  (default off). Layer positions come from the element's own `currentTime`,
  never from elapsed-time arithmetic.
- `fallbackToSynthetic` is still accepted on `StartSceneOptions` for call-site
  compatibility but is a **no-op** here — the html5 path streams real files.

The Web Audio engine (`AudioEngine`/`SceneCoordinator`/`FileLayer`/
`MasterBus`/`NoiseGenerator`) is **retained only for the dev harness and its
unit tests** — it is off the production overnight path. Its `FileLayer`
chain-timer design (`LOOKAHEAD_COUNT = 3`, `pipelineTail`,
`lastHandledStartTime`) is subtle; read it before touching it, and don't wire
it back into a user-facing path without re-deciding the pivot.

---

## File layout

```
src/
  audio/howl/        the production scene-bed engine (HowlScene,
                     HowlScenePlayer); tests alongside
  audio/             the legacy Web Audio engine (dev harness + tests only),
                     plus shared scene types/format, taper.ts, mediaSession,
                     sceneRegistry, and sceneCatalogue.test.ts — the
                     scene-contract conformance test
  screens/           TonightScreen, PlayerScreen, LibraryScreen,
                     ContentPlayerScreen, SettingsScreen, DeepNightDoor
  storage/           settings.ts (localStorage), persistence.ts (storage
                     durability + legacy-DB disposal), types.ts, index.ts —
                     import from '../storage', never reach past it
  diagnostics/       lifecycleLog.ts (page-lifecycle events) and markers.ts
                     (debug markers + the seam analysis the app and the
                     review tool share)
  lib/               baseUrl, bedtime, deepNight, narrationSundown,
                     sceneBackground, buildInfo
public/
  scenes/            scene JSON served statically; index.json is the
                     catalogue; _held-back/ is out of every glob
  audio/             scene variant audio (Opus) + .json sidecars;
                     _bed/ holds the pre-rendered synth-bed noise loops
  meditations/       narration audio + index.json + the .txt scripts
  stories/           narration audio + index.json + the .txt scripts
  sw.js              service worker; CACHE_VERSION lives here
tools/               see "Scene authoring"; also the TTS audition rig
                     (tts-audition/-verify/-ladder, accent-id,
                     voice-similarity, bedmix)
notes/               research and review history; read-only
.handoff/            PENDING-DECISIONS.md + SESSION-HANDOFF.md — the live
                     state of the project
DECISIONS.md         historical architecture decisions; APPEND, never rewrite
NEXT_STEPS.md        personal current-state TODO; gitignored
```

`notes/shipping-review-2026-06-12/` holds the 2026-06-12 eight-front shipping
review (8 reports + executive summary) and `09-roadmap-to-v1.1.md`. The
reports are read-only history; the roadmap is a checklist that has been
partly overtaken by events — trust `.handoff/PENDING-DECISIONS.md` where they
disagree.

---

## Running it

```bash
npm run dev          # Vite dev server
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src
npm run build        # typecheck + vite build
```

On tikiserv, prefix tool-shell commands with `source ~/.nvm/nvm.sh`.
