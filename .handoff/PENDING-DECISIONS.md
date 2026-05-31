# Pending decisions

Items waiting on your input or queued for the next session.
Refreshed 2026-05-31 afternoon.

## 1. Device-test the story-generation sleep fix — TOP PRIORITY
*(Shipped 2026-05-31 in `52ec0cc`. Needs eyes on real hardware.)*
- Bug was: generating a story on the phone PWA died the moment the screen
  slept ("Failed to fetch"), and the UI sat stuck on "Writing script with
  Claude…" for 20+ min.
- Fix: wake lock while generating + per-request fetch timeouts + clear
  retry messaging. On the v7 deploy, generate a story and let the screen
  sleep mid-run — it should stay awake and finish. If it ever does fail,
  you should now get an actionable message, not a silent hang.

## 2. Device-test content backgrounds + meditation bed on v7
*(Carryover. Stories portion `cd48c24`; singing-bowl bed `b766f8b`.)*
- Tap a bundled story (seaside-village or night-train): bed fades in under
  the narration, narration ends, **bed keeps playing with no dead air**,
  backing out to Library leaves it running, Tonight shows the paired scene
  as "last played".
- Tap a meditation: the new **singing-bowl bed** plays underneath and
  **stops with the meditation** (intentionally different from stories).
- PWA installs cleanly from the deployed site; offline launch works.
- Smallest red flag is most informative — flag the symptom, don't
  self-diagnose.

## 3. ~~Singing-bowl bed for meditations~~ — DONE + pushed
*(`b766f8b`, pushed 2026-05-31.)*
- Two ambient layers (drone @251s, shimmer @409s) over a brown synth bed,
  per the incommensurate-loops rule. `MeditationMetadata.sceneId` wired;
  CACHE_VERSION bumped to v7. Verification folded into #2 above.

## 4. ~~Content backgrounds (stories)~~ — DONE
*(`cd48c24`. Verification folded into #2.)*

## 5. ~~Secondary-button consolidation~~ — DONE
*(`2048d9a`. Three-tier button system documented in DECISIONS.md.)*

## 6. Litter to clear during "deferred clean-up work" (low priority)
- **Worktree dirs**: `.git/worktrees/` + `.claude/worktrees/` can't be
  deleted (Drive holds handles), so every git op prints ~16 "Permission
  denied" lines. `git worktree list` shows only main — cosmetic.
- **NEW: remote-tracking refs bloated to ~1000** (mostly duplicate
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
