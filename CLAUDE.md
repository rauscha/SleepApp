# Claude Code instructions for this project

## Current focus — Roadmap to v1.1 (as of 2026-06-12)

A full eight-front shipping review lives in
`notes/shipping-review-2026-06-12/` (`00-executive-summary.md` first).
**The execution plan is `09-roadmap-to-v1.1.md` in that directory — work
its phases in order and check steps off there as they land.** Headline:
security signed off, architecture graded A−, but Phase 1 of the roadmap
fixes 2 Critical + 3 High bugs in the overnight-survival and sleep-timer
paths that gate v1.0. Don't start lower-phase polish while a Phase 1 box
is unchecked.

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
   Roadmap step 2.2 adds a conformance test so the contract enforces
   itself; until that test exists, verify offsets by hand on every scene
   edit.)

3. **Every variant MP3 must be longer than its element's
   `loopOffsetSeconds + crossfadeSeconds`** (default crossfade = 5s).
   FileLayer needs the tail to crossfade into the next iteration. If your
   source audio is shorter than the offset, either pick a longer source,
   acrossfade-extend the source (see `tools/grow-out-scenes.sh` for an
   example), or pad sparse "event" layers with silence — don't lower the
   offset off the prime list. **Leave ≥10s of margin** over the bare
   minimum: the review found four shipped variants within 10s of the
   limit, which silently become scene-killing constructor throws if
   `crossfadeSeconds` is ever raised. (Trap discovered there: fixing
   rain-pavement's offset to 521 requires extending `pavement-2.mp3`
   first — it's 525s, 1s under the new requirement.)

4. **Voice the stack like a mix**, not like a flat sum: the closest /
   primary element rides loudest (~0.55–0.60), supporting layers sit at
   0.25–0.35, and the synth bed underneath at ~0.10–0.16 to glue the
   spectrum. Sparse "event" layers (distant thunder, occasional dockside)
   sit quieter still (~0.18–0.20) and use a long mostly-silent loop.

If you're adding a scene with only one element because that's all the
source audio you have, **don't ship it yet** — either find/transcode more
layers first, or stub it as a comment in `public/scenes/index.json`. A
sparse scene shipped now is harder to fix later than one held back.

## Audio engine invariants

- `FileLayer` pre-fills a 3-iteration pipeline (`LOOKAHEAD_COUNT = 3`) so
  iOS Safari setTimeout throttling can't cause a loop seam.
- Never remove `pipelineTail` or `lastHandledStartTime` without reading the
  chain-timer design in `FileLayer.ts` first.
- Scene crossfade (8s) runs via `SceneCoordinator.startScene()` — do not
  call `fileLayer.stop()` directly during a scene transition.
- **Overnight protections must be owned by the playback session, not a
  screen.** Keep-alive, the `<audio>` element sink, SW keep-alive, and
  media session must live/die with the scene (SceneCoordinator), never in
  a React unmount cleanup — a screen exit while audio plays must strip
  nothing. (2026-06-12 review bug C1; roadmap step 1.1.)
- **The element sink is a watchdog blind spot:** a paused sink element
  with the bus still routed into it is total silence while the
  AudioContext stays `running` with `currentTime` advancing — the zombie
  detector cannot see it. Any change to sink engagement must keep a
  recovery path (detach-and-fall-back beats silence) and a
  `sinkElement.paused && elementSinkEngaged` check in the watchdog.
  (Review bug C2; roadmap step 1.2.)
- Production paths must fail loudly: `fallbackToSynthetic` is a dev-only
  affordance — the sole legitimate prod use is the 3am
  `restartAfterContextLoss` last resort, where sound beats silence.

## File layout reminders

- `src/screens/` — Phase 3 UI screens (TonightScreen, PlayerScreen).
- `src/audio/` — audio engine; pure-function tests in `*.test.ts` files.
- `public/scenes/` — scene JSON files served statically; `index.json` is
  the scene catalogue.
- `NEXT_STEPS.md` — personal current-state TODO; gitignored. Update if
  present, skip if absent.
- `DECISIONS.md` — historical architecture decisions; don't overwrite, append.
- `notes/shipping-review-2026-06-12/` — the 2026-06-12 shipping review
  (8 reports + executive summary) and `09-roadmap-to-v1.1.md`, the
  current execution plan. Reports are read-only history; the roadmap is
  the live checklist.
