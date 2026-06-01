# Pending decisions

Items waiting on your input or queued for the next session.
Refreshed 2026-06-01.

## 1. Device-test EVERYTHING in one overnight pass on v7 — TOP PRIORITY
This consolidates three queued device tests into a single overnight run,
since each one only confirms its part of "audio survives the night":

- **Story-gen sleep fix** (`52ec0cc`, 2026-05-31). Generate a story, let
  the screen sleep mid-run. Should stay awake and finish; if it ever
  fails, you get a friendly retry message, not a 20-min silent hang.
- **Content backgrounds + singing-bowl bed** (`cd48c24` + `b766f8b`,
  2026-05-31). Tap a bundled story (seaside-village or night-train): bed
  fades in under the narration, narration ends, **bed keeps playing with
  no dead air**, backing out to Library leaves it running. Tap a
  meditation: the singing-bowl bed plays underneath and stops with the
  meditation (intentionally different from stories). PWA installs cleanly.
- **NEW: Background slider + bed-keeps-alive fix** (`67eaabf`,
  2026-06-01). The big one. Fall asleep to a story on the player screen;
  bed should still be playing in the morning (not silent). Adjust the
  Background slider during the story — does 50% feel right? Slide further
  if not; the value persists.
- Smallest red flag is most informative — flag the symptom, don't
  self-diagnose.

## 2. Residual wake-lock gap (follow-up commit, not blocking #1)
If you back out of ContentPlayerScreen while a story-style continue-bed
is still running, Library/Tonight don't own a wake lock, so the bed
eventually suspends. Common case is "fell asleep on the player screen,"
which `67eaabf` covers; this is the rarer "started a story, backed out
to Library, fell asleep there." Proper fix is coordinator-owned
keep-alive (engages whenever the coordinator has a current scene,
independent of which screen is mounted). Queue for a quiet session.

## 3. ~~Singing-bowl bed for meditations~~ — DONE + pushed
*(`b766f8b`, pushed 2026-05-31. Verification folded into #1.)*

## 4. ~~Content backgrounds (stories)~~ — DONE
*(`cd48c24`. Verification folded into #1.)*

## 5. ~~Secondary-button consolidation~~ — DONE
*(`2048d9a`. Three-tier button system documented in DECISIONS.md.)*

## 6. Litter to clear during "deferred clean-up work" (low priority)
- **Worktree dirs**: `.git/worktrees/` + `.claude/worktrees/` can't be
  deleted (Drive holds handles), so every git op prints ~16 "Permission
  denied" lines. `git worktree list` shows only main — cosmetic.
- **Remote-tracking refs bloated to ~1000** (mostly duplicate
  `origin/main`) from the same Drive-handle chaos during fetches.
  `git branch -a` floods. Cosmetic; doesn't affect push/pull of main.
- **3 stray local branches** (`claude/objective-kirch-e41ce1`,
  `claude/optimistic-khayyam-1e864b`, `backup/pre-rebase-2026-05-30`),
  all 0 commits ahead of main — safe to delete.
- To clean (only when you say "deferred clean-up work"): pause Drive sync,
  then `git worktree prune`, `rm -rf .claude/worktrees/* .git/worktrees/*`,
  `git remote prune origin` / repack refs, delete the stray branches, and
  confirm `git worktree list` + `git branch -a` are healthy.

## 7. Cleanup chore (whenever)
- `rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3`
  — gitignored loudnorm backups, safe to delete now that loudness is
  validated.
