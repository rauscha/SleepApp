# Claude Code instructions for this project

## Current focus — v1.0 ship candidate (as of 2026-06-15)

A full eight-front shipping review lives in
`notes/shipping-review-2026-06-12/` (`00-executive-summary.md` first); its
execution plan is `09-roadmap-to-v1.1.md` (check steps off there as they
land). Phases 1–5 are essentially done and the overnight-survival problem
that gated v1.0 is **solved** — see "Audio engine invariants" below: the
scene bed was pivoted off Web Audio onto a native Howler `html5` engine
(2026-06-15, recorded in DECISIONS.md), confirmed over a real 6h overnight.
What's left before tagging v1.0 is the roadmap's `[ASK]`/`[DEVICE]` items:
replace 3 off-brief photos (4.3), decide the meditation catalogue (6.5), and
run the device pass + tag (5.2).

## After completing any step

If a local `NEXT_STEPS.md` exists at the repo root, update it before
committing — mark the finished item done and adjust priorities if the
work surfaced new tasks. The rule is: when present, `NEXT_STEPS.md`
should reflect the actual current state of the project, not a stale
snapshot. The file is gitignored (personal working notebook), so skip
this step in a fresh clone that doesn't have one.

## Commit discipline

- One logical change per commit. Typecheck + tests must be green.
- Follow the existing commit message style (see `git log --oneline`): short
  imperative subject, multi-paragraph body with what changed and why, the
  "Validated:" line, and the Co-Authored-By trailer.
- Never commit `.env` or credential files.

## Worktrees — the real invariant is "committed and pushed on main"

This repo lives on Google Drive, which constantly holds file handles open
inside `.git/worktrees/` and `.claude/worktrees/`. As a result:

- **`git worktree prune` / `rm -rf` on those dirs will fail with
  "Permission denied", and that is EXPECTED — not a problem to solve.**
  Every git op prints ~16 lines of permission spam. It's cosmetic. Commits
  and pushes still succeed.
- **The thing that actually matters: is the work committed and pushed to
  `origin/main`?** If yes, we're safe — stranded worktree state, dangling
  commits, and leftover `claude/*` branches are all just litter, not lost
  work. Always verify with `git worktree list` (should show only `main`)
  and `git rev-list --left-right --count origin/main...HEAD` (ahead should
  be 0 after a push).
- **Keep notes about where we left off** instead of trying to force a clean
  tree — the hand-off / pick-up skills already do this. That's the
  mitigation, not pruning.
- **Don't attempt the actual worktree cleanup unprompted.** Save it for
  when I explicitly ask to do "deferred clean-up work" — that's the signal
  to pause Drive sync, then `git worktree prune` + `rm -rf
  .claude/worktrees/* .git/worktrees/*` and confirm `git worktree list` is
  healthy.

## Design constraints (from the brief)

- **The One Thing:** put me to sleep and let me stay there.
- No alarm, no notifications, no telemetry, no accounts, no onboarding wall.
- UI style: Midnight Editorial Minimalism — deep/dark, warm stone, editorial
  serif headings, moonlit sage accent. Photography, not illustration. No loud
  wellness iconography.
- Body text minimum 16px. Touch targets minimum 44×44px.
- Tinnitus features are shelved — keep the engine, hide the UI.
- Phase 5 items (PWA, iOS device test, perf) come last.

## Scene authoring — the incommensurate-loops rule (READ THIS BEFORE TOUCHING SCENES)

The whole reason scenes feel alive instead of loopy is **pairwise-coprime
loop offsets across multiple layered elements** — Brian Eno's *Music for
Airports* technique. The combined audio pattern only repeats at the LCM of
the per-element offsets, which (for the canonical primes below) is tens of
hours. Lose that and the scene starts sounding like a tape loop within ten
minutes. This is core audio design, not an implementation detail.

**Hard rules** when adding or editing a scene JSON in `public/scenes/`:

1. **Every scene MUST have at least 2 layered ambient `elements`, ideally
   3–4.** A scene that is just `synth` + one element is a bug, not a scene
   — it defeats the whole point and **must not be committed**. The older
   shipped scenes (forest-day, rain-on-window, fireplace) are the reference
   pattern: 2–3 elements stacked over a synth bed, each on its own offset.

2. **Each element MUST use a different loop offset, picked from
   `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`** in [src/audio/sceneFormat.ts]
   (current list: **251, 409, 521, 691, 887** seconds — true primes,
   pairwise gcd 1, LCM ≈ 28 h for the smallest pair). Off-list values
   (e.g. 175, 230, 590) are wrong even if they're "close to a prime" —
   the canonical list is the contract. If you need a sixth offset, add
   another true prime to that list, don't pick an arbitrary number.
   (2026-06-12 review: shipped `rain-on-window.json` carried an off-list
   515 for ~weeks and nothing caught it — four independent reviewers did.
   `src/audio/sceneCatalogue.test.ts` now enforces this for every scene, so
   a bad offset fails the suite — but still sanity-check by eye.)

3. **Every variant file's length must EQUAL its element's
   `loopOffsetSeconds`** (within ~2.5s encode-frame slack). Under the Howler
   `html5` engine (see "Audio engine invariants" below) each layer loops the
   *whole file* natively — the file **is** the loop, so its length sets the
   loop period. A file longer or shorter than its prime offset breaks the
   incommensurate-loops math (the combined pattern resyncs early, or the loop
   ticks). Don't hand-trim: run **`tools/loopify-scenes.py`**, which trims
   every variant to its element's offset with a gapless 6s wrap (head summed
   over the faded post-loop tail) so native looping has no seam, and renders
   the synth-bed carriers. It's idempotent — **re-run it any time you add or
   change scene audio**; then `src/audio/sceneCatalogue.test.ts` verifies
   every file landed on its prime. (Pre-pivot this rule was the opposite —
   "longer than offset + crossfade" — because the old FileLayer crossfaded
   *within* a longer file. `tools/grow-out-scenes.sh` belonged to that era;
   loopify supersedes it.)

   **Format: scene audio ships as Opus, not MP3** (2026-06-30 decision — see
   DECISIONS.md "Ship scene audio as Opus, not MP3"). MP3's ~16kHz lowpass
   strips the noise "air" that matters for this material; Opus preserves to
   ~20kHz at a smaller size. `loopify-scenes.py` always emits `.opus` now —
   feed it any source format (mp3/wav/opus/ogg) and it converts + rewrites
   the scene JSON's variant URLs in place. Note libopus only encodes at
   8/12/16/24/48kHz (not 44.1kHz) — the pipeline targets 48000 Hz throughout.
   Migration is scene-by-scene, not a flag day: `sceneCatalogue.test.ts` and
   `HowlScene`'s Howler `format` list accept both `.mp3` and `.opus` while
   older scenes haven't been re-cut yet.

4. **Voice the stack like a mix**, not like a flat sum: the closest /
   primary element rides loudest (~0.55–0.60), supporting layers sit at
   0.25–0.35, and the synth bed underneath at ~0.10–0.16 to glue the
   spectrum. Sparse "event" layers (distant thunder, occasional dockside)
   sit quieter still (~0.18–0.20) and use a long mostly-silent loop. The
   synth bed is no longer a live Web-Audio `NoiseGenerator`: it's a
   pre-rendered 887s noise loop (`public/audio/_bed/<color>.opus` — the 5th
   prime, coprime to every element offset) that `HowlScene` plays as a quiet
   native layer under every scene. Tune its level by ear with the in-app
   "Synth bed" mixer slider; re-render it via `tools/loopify-scenes.py`.

If you're adding a scene with only one element because that's all the
source audio you have, **don't ship it yet** — either find/transcode more
layers first, or stub it as a comment in `public/scenes/index.json`. A
sparse scene shipped now is harder to fix later than one held back.

## Audio engine invariants

**The production scene bed runs through Howler `html5` (`src/audio/howl/`),
not Web Audio.** This was the 2026-06-15 pivot (DECISIONS.md): routing the
Web Audio bus into an `<audio>` element via `MediaStreamAudioDestinationNode`
is explicitly unsupported (W3C #2293) — on Chromium the element's
`currentTime` never advances, so the OS freezes the tab ~90s after
screen-off. That was the overnight death we chased for days; no watchdog
beats a primitive the browser suspends by design. The fix lets the OS own
each loop, exactly like Spotify/Calm/YouTube.

- **`HowlScene`** plays one looping `Howl({ html5: true, loop: true })`
  `<audio>` element per layer (plus the synth-bed carrier). It exposes the
  same surface PlayerScreen reads off the old Web Audio `Scene`
  (`id`/`definition`/`getLayers`/`setLayerVolume`/`isDisposed`), so the UI
  was untouched by the pivot.
- **`HowlScenePlayer`** (`getHowlScenePlayer()`) is the playback session —
  the drop-in for `SceneCoordinator`'s production surface
  (`startScene`/`crossfadeTo`/`stopScene`/`getCurrentScene`/`sleepTimer`/
  `setSceneResolver`). Scene crossfade defaults to 8s. Tonight, App, Player,
  and ContentPlayer all point here.
- **No keep-alive stack on this path.** Because the OS owns each looping
  element, there is *no* MediaStream sink, silent keep-alive, zombie
  watchdog, or `recreateContext` on the bed. Don't reintroduce them — they
  were treating symptoms of the unsupported construct above (the closed
  draft "element-sink stall watchdog" PR was the pivot's casualty).
- **Overnight protections are still owned by the session, not a screen.**
  `HowlScenePlayer` owns the sleep timer, Night Drift, the OS media session,
  and the SW keep-alive ping; they live/die with the scene, never in a React
  unmount cleanup — a screen exit while audio plays must strip nothing.
  (2026-06-12 review bugs C1/H1/H3, preserved across the pivot.)
- **Overlapping starts serialize to one winner** via `startGeneration` — a
  superseded build is `dispose()`d, not started (review bug M1).
- `fallbackToSynthetic` is still accepted on `StartSceneOptions` for
  call-site compatibility but is a **no-op** on the html5 path — it streams
  real files, so there is no synthetic pad to fall back to.

The Web Audio engine (`AudioEngine`/`SceneCoordinator`/`FileLayer`/
`MasterBus`/`NoiseGenerator`) is **retained only for the dev harness and its
unit tests** — it is off the production overnight path. If you must touch it,
its `FileLayer` chain-timer design (`LOOKAHEAD_COUNT = 3`, `pipelineTail`,
`lastHandledStartTime`) is subtle — read it first. Don't wire it back into a
user-facing path without re-deciding the pivot.

## File layout reminders

- `src/screens/` — Phase 3 UI screens (TonightScreen, PlayerScreen).
- `src/audio/howl/` — **the production scene-bed engine** (`HowlScene`,
  `HowlScenePlayer`); tests alongside.
- `src/audio/` — the legacy Web Audio engine (dev harness + tests only — see
  "Audio engine invariants") plus shared scene types/format; `*.test.ts`
  files, including `sceneCatalogue.test.ts`, the scene-contract conformance
  test.
- `public/scenes/` — scene JSON files served statically; `index.json` is
  the scene catalogue.
- `public/audio/` — scene variant audio (Opus; some scenes still MP3 pending
  re-cut) + `.json` sidecars; `_bed/` holds the pre-rendered synth-bed noise
  loops (`.opus`).
- `tools/loopify-scenes.py` — idempotent; trims variants to their prime
  offset (gapless) and renders the synth beds. Re-run on any scene-audio
  change.
- `NEXT_STEPS.md` — personal current-state TODO; gitignored. Update if
  present, skip if absent.
- `DECISIONS.md` — historical architecture decisions; don't overwrite, append.
- `notes/shipping-review-2026-06-12/` — the 2026-06-12 shipping review
  (8 reports + executive summary) and `09-roadmap-to-v1.1.md`, the
  current execution plan. Reports are read-only history; the roadmap is
  the live checklist.
