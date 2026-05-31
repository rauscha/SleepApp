# Pending decisions

Items waiting on your input or queued for the next session.
Refreshed 2026-05-31 morning.

## 1. ~~Content backgrounds~~ — STORIES DONE; meditations spawned as chip
*(Stories portion shipped 2026-05-31 in `cd48c24`. The meditation
singing-bowl bed is queued as a worktree chip — start it from the
spawn UI when you're ready to let audiocraft cook.)*
- Stories now play over a paired scene that keeps running all night
  after narration ends. Bundled mappings: seaside-village → ocean-night,
  night-train → forest-night. User-generated stories pick their bed via
  a new scene dropdown in StoryGeneratorScreen.
- Meditation bed plumbing is in place (`bedBehavior='stop-with-content'`
  in ContentPlayerScreen + MeditationMetadata.sceneId field still to be
  added). Singing-bowl audio + scene JSON will land via the chip.

## 2. ~~Secondary-button consolidation~~ — DONE
*(Shipped 2026-05-31 in `2048d9a`.)*
- Both gray-pill Cancels migrated to the ghost-border tier. Three-tier
  system documented in DECISIONS.md "Later additions". No action.

## 3. ~~Stale worktrees~~ — resolved; cosmetic litter remains
- `git worktree list` shows only main. The on-disk `.git/worktrees/` +
  `.claude/worktrees/` dirs can't be deleted (Google Drive holds the
  handles), so every git op prints ~16 "Permission denied" lines —
  harmless, commits/pushes succeed. To clean: pause gdrive sync,
  `git worktree prune`, `rm -rf .claude/worktrees/* .git/worktrees/*`,
  then `git worktree list` to confirm main is healthy. Low priority.

## 4. ~~Verify normalized voice content~~ — resolved 2026-05-30 night
- Phone walkthrough confirmed loudness parity. **Cleanup available**
  whenever: `rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3` (gitignored backups).

## 5. PWA install + content backgrounds on tonight's deployed build
*(Carrying over from yesterday + adding the content-backgrounds
verification.)*
- The v6 build adds the content-backgrounds feature on top of the v5
  PWA-install fix. Two things to check on the deployed Pages build
  tonight:
  - PWA installs cleanly from the deployed site; offline launch works.
  - Tap a bundled story (seaside-village or night-train). Confirm:
    bed fades in underneath, narration plays over it, narration ends,
    **bed keeps playing with no dead air**, backing out to Library
    leaves bed running, Tonight shows the paired scene as "last played".
- If anything's off, the smallest red flag is most informative — flag
  the symptom rather than self-diagnose.

## 6. Singing-bowl bed for meditations — chip queued
*(Spawned 2026-05-31. No user input needed until it runs.)*
- Lives as a separate worktree chip in the spawn UI. Start it when you
  want to let audiocraft run (likely overnight or unattended — model
  generation + scene authoring + cache bump is mostly hands-off).
- When done, the chip will commit + push from its own branch. Pull on
  this side after to bring it into main.
