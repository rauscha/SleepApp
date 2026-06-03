# Pending decisions

Items waiting on your input or queued for the next session.
Refreshed 2026-06-03.

## 1. Read the lifecycle log after the next Signal interruption — TOP PRIORITY
Clear the log first (Settings → Diagnostics → Clear), then reproduce the
Signal-text audio-kill and paste the log here. The new logging (`555270c`)
now captures AudioContext state changes from the engine regardless of screen,
so the event sequence will look something like:

```
keepalive-start  (content)        ← story starts
audio-state      running
visibility-hidden                 ← switch to Signal
audio-state      suspended        ← Signal grabs focus  ← NEW
audio-state      running          ← Signal closes
audio-state      suspended        ← ~30s later?  ← NEW (or absent = pipeline-drain)
```

If the second `suspended` appears → fix is AudioContext recovery (rebuild
pipeline on resume). If absent → fix is FileLayer pipeline-drain recovery
(reschedule stale pre-buffered iterations after context resumes).

## 2. Device-test all three bed/story items (was #1, still pending)
One overnight pass covers:
- Story-gen sleep fix (`52ec0cc`): generate a story, screen sleeps mid-run —
  should finish without hanging.
- Content backgrounds + singing-bowl bed (`cd48c24` + `b766f8b`): bundled
  story plays bed underneath; bed continues after narration ends; back-out
  leaves bed running. Meditation bed stops with the meditation.
- Background slider + bed-keeps-alive (`67eaabf`): fall asleep to a story —
  bed should still be playing in the morning. Is 50% the right slider default?
Smallest red flag is most informative — flag the symptom, don't self-diagnose.

## 3. Residual wake-lock gap (follow-up commit, not blocking above)
If you back out of ContentPlayerScreen while a story-style continue-bed is
still running, Library/Tonight don't own a wake lock. Fix: coordinator-owned
keep-alive that engages whenever the coordinator has a current scene,
independent of which screen is mounted. Queue for a quiet session.

## 4. ~~Singing-bowl bed for meditations~~ — DONE
## 5. ~~Content backgrounds (stories)~~ — DONE
## 6. ~~Secondary-button consolidation~~ — DONE

## 7. Litter to clear during "deferred clean-up work" (low priority)
- **Worktree dirs**: `.git/worktrees/` can't be deleted (Drive holds handles)
  — every git op prints ~16 "Permission denied" lines. Cosmetic.
- **Remote-tracking refs bloated** to ~1000 duplicate `origin/main` entries.
  `git branch -a` floods. Cosmetic; push/pull of main unaffected.
- **3 stray local branches** (`claude/objective-kirch-e41ce1`,
  `claude/optimistic-khayyam-1e864b`, `backup/pre-rebase-2026-05-30`),
  all 0 commits ahead of main — safe to delete.
- To clean: only when you say "deferred clean-up work" — pause Drive sync,
  `git worktree prune`, `rm -rf .claude/worktrees/* .git/worktrees/*`,
  `git remote prune origin`, delete stray branches.

## 8. Cleanup chore (whenever)
- `rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3`
  — gitignored loudnorm backups, safe to delete.
