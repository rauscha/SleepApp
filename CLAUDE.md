# Claude Code instructions for this project

## After completing any step

Update `NEXT_STEPS.md` before committing. Mark the finished item done and,
if the work surfaced new tasks or changed priorities, adjust the list
accordingly. The rule is: `NEXT_STEPS.md` should always reflect the actual
current state of the project, not a stale snapshot.

## Commit discipline

- One logical change per commit. Typecheck + tests must be green.
- Follow the existing commit message style (see `git log --oneline`): short
  imperative subject, multi-paragraph body with what changed and why, the
  "Validated:" line, and the Co-Authored-By trailer.
- Never commit `.env` or credential files.

## Design constraints (from the brief)

- **The One Thing:** put me to sleep and let me stay there.
- No alarm, no notifications, no telemetry, no accounts, no onboarding wall.
- UI style: Midnight Editorial Minimalism — deep/dark, warm stone, editorial
  serif headings, moonlit sage accent. Photography, not illustration. No loud
  wellness iconography.
- Body text minimum 16px. Touch targets minimum 44×44px.
- Tinnitus features are shelved — keep the engine, hide the UI.
- Phase 5 items (PWA, iOS device test, perf) come last.

## Audio engine invariants

- `FileLayer` pre-fills a 3-iteration pipeline (`LOOKAHEAD_COUNT = 3`) so
  iOS Safari setTimeout throttling can't cause a loop seam.
- Never remove `pipelineTail` or `lastHandledStartTime` without reading the
  chain-timer design in `FileLayer.ts` first.
- Scene crossfade (8s) runs via `SceneCoordinator.startScene()` — do not
  call `fileLayer.stop()` directly during a scene transition.

## File layout reminders

- `src/screens/` — Phase 3 UI screens (TonightScreen, PlayerScreen).
- `src/audio/` — audio engine; pure-function tests in `*.test.ts` files.
- `public/scenes/` — scene JSON files served statically; `index.json` is
  the scene catalogue.
- `NEXT_STEPS.md` — canonical current-state TODO (update after each step).
- `DECISIONS.md` — historical architecture decisions; don't overwrite, append.
