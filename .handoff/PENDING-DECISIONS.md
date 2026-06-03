# Pending decisions

Items waiting on your input or queued for the next session.
Refreshed 2026-06-03.

## 1. Device-test all three bed/story items (still pending)
One overnight pass covers:
- Story-gen sleep fix (`52ec0cc`): generate a story, screen sleeps mid-run —
  should finish without hanging.
- Content backgrounds + singing-bowl bed (`cd48c24` + `b766f8b`): bundled
  story plays bed underneath; bed continues after narration ends; back-out
  leaves bed running. Meditation bed stops with the meditation.
- Background slider + bed-keeps-alive (`67eaabf`): fall asleep to a story —
  bed should still be playing in the morning. Is 50% the right slider default?
Smallest red flag is most informative — flag the symptom, don't self-diagnose.

## 2. Check title on today's generated story
The story generated this session used the old code (before `daaa2b2`) so
its title will be the raw theme text. That's expected and fine — it's stored,
not regenerable. If the title bothers you, you can hand-edit `stories/index.json`
in IndexedDB via the browser dev tools (Application → IndexedDB → stories).
Future stories will get short Claude-supplied titles automatically.

## 3. Residual wake-lock gap (follow-up commit, not blocking)
If you back out of ContentPlayerScreen while a story-style continue-bed is
still running, Library/Tonight don't own a wake lock. Fix: coordinator-owned
keep-alive that engages whenever the coordinator has a current scene,
independent of which screen is mounted. Queue for a quiet session.

## 4. ~~Signal interruption hunting~~ — DROPPED
User decision: edge case, not worth pursuing for personal use.

## 5. ~~Singing-bowl bed for meditations~~ — DONE
## 6. ~~Content backgrounds (stories)~~ — DONE
## 7. ~~Secondary-button consolidation~~ — DONE
## 8. ~~Singing-bowl card photo~~ — DONE
## 9. ~~Story title from Claude~~ — DONE
## 10. ~~Stop-all button in ContentPlayerScreen~~ — DONE

## 11. Litter to clear during "deferred clean-up work" (low priority)
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

## 12. Cleanup chore (whenever)
- `rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3`
  — gitignored loudnorm backups, safe to delete.
