# Pending decisions

Items waiting on your input or queued for the next session. None blocks
tonight's sleep test. Refreshed 2026-05-30 night.

## 1. Content backgrounds — NEW, the next headline feature
*(Requested 2026-05-30 night. Mostly a build task; one open design sub-decision.)*
- **Stories** should play over an appropriate ambient **noise scene that keeps
  playing all night** after the narration ends — no dead air, so the listener
  stays asleep. **Meditations** should play over a **singing-bowl sound bath** bed.
- **Open sub-decision (yours):** how does a story map to "an appropriate scene"
  — a fixed per-story mapping, whatever's selected on Tonight, or one sensible
  default (e.g. rain)? Decide this before building.
- Build notes + rationale in memory `project_content_backgrounds`. Wiring lives
  in ContentPlayerScreen + SceneCoordinator; respect the FileLayer lookahead /
  crossfade invariants. Singing-bowl audio to be sourced per the audio-pipeline
  conventions.

## 2. Secondary-button consolidation — DECIDED, implementation queued
*(Unchanged — not done yet. Decision made 2026-05-30 evening: style A, ghost border.)*
- **Target style**: `border border-moon-700 rounded-soft text-moon-300 hover:text-moon-200 px-3 py-1.5 ui-label transition-colors duration-slow`. Match the "Generate new story" button in LibraryScreen.
- **Migrate**: the gray-pill Cancel buttons in SettingsScreen.tsx and StoryGeneratorScreen.tsx (`bg-ink-700 text-stone-300 rounded-soft`).
- **Leave alone (text-link tier)**: back arrows (`← Back`, `← Scenes`), Library row Play/Delete.
- **Document**: append the decision to `DECISIONS.md` in the same commit. ~30 min incl. typecheck + tests.

## 3. ~~Stale worktrees~~ — resolved; cosmetic litter remains
- `git worktree list` shows only main. The on-disk `.git/worktrees/` +
  `.claude/worktrees/` dirs can't be deleted (Google Drive holds the handles),
  so every git op still prints ~16 "Permission denied" lines — harmless,
  commits/pushes succeed. To clean: pause gdrive sync, `git worktree prune`,
  `rm -rf .claude/worktrees/* .git/worktrees/*`, then `git worktree list` to
  confirm main is healthy. Low priority.

## 4. ~~Verify normalized voice content~~ — resolved 2026-05-30 night
- Phone walkthrough confirmed meditation/story loudness parity is good and
  there's no body-scan pop. The seaside "soft pop" was not reproducible on
  device → closed as an artifact (PCM analysis found no click).
- **Cleanup available** whenever: `rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3` (gitignored backups).

## 5. PWA install from Tailscale dev URL — re-test on tonight's deployed build
- Earlier the dev-server PWA install misbehaved (dev doesn't run the
  `swPrecachePlugin` — build-only). Should resolve from the deployed Pages
  build, which you're installing tonight (`CACHE_VERSION v5`).
- **Action**: when you save the PWA tonight, confirm install + offline launch
  work from the deployed site. If good, close this.
