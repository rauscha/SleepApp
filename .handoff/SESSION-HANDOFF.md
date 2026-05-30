# Session hand-off — 2026-05-30 evening (machine: desktop)

## STATE (read this first)
- Branch: `main`, clean working tree, synced with `origin/main` after this hand-off pushes.
- Tests: 113/113 green; `npm run typecheck` clean.
- 1 new commit this session on top of the afternoon's 4: `6428191` (card-overlay tweak). Latest tip will be the hand-off commit on top of that.
- Dev server is **OFF** (PID 33832 killed this session). Port 5175 is free. Tailscale forwarding rule still points at it — bring up `npm run dev` again to use it.
- Three stale worktrees from earlier have been cleared from git's view; `git worktree list` shows only main. (See "Watch out for" #1 — there's still some on-disk litter.)

## Done this session
- **Worktree triage** — confirmed `optimistic-robinson-b36490`, `distracted-euclid-22b22a`, and `objective-kirch-e41ce1` were all subsumed by main, removed them from git's registry. `git worktree list` is now clean. The `.git/worktrees/<name>/` and `.claude/worktrees/<name>/` on-disk admin dirs could not be deleted because Google Drive sync was holding the file handles — git no longer references them so they're harmless, but the per-commit "Permission denied" noise will keep showing up until they're manually swept (pause gdrive, prune, rm -rf). See PENDING-DECISIONS #3 for the cleanup recipe.
- **Card overlay lightened** (`6428191`). `CARD_OVERLAY` in src/lib/sceneBackground.ts dropped from 35→55→95% dark to 25→45→85% so the photos carry more visual weight on the Tonight scene picker now that all 7 scenes have photography. Added a comment to the file recording the rationale. Player overlay (55→70→92%) intentionally untouched — it needs the heavier gradient for control legibility.
- **Secondary-button decision recorded**: option A (ghost border, moon-700 outline, `rounded-soft`, text-moon-300). Implementation NOT yet done — queued in PENDING-DECISIONS #2 with target style and migration targets listed. Should be a ~30-min sweep next session.
- **Dev server killed** (PID 33832 / port 5175). User wanted the port back until the next test session.

## Next up
1. **Phone walkthrough** to verify the day's work — this is unchanged from the afternoon hand-off and is still the highest-value next action. Loudness parity (body-scan vs seaside), story pop gone, new photos on cards + Player background, back button works, crossfade feels like an exhale, **and the newly-lightened card overlay still reads cleanly**. See PENDING-DECISIONS #1 + #4. Will need `npm run dev` brought back up first.
2. **Secondary-button sweep** — implement style A on the two Cancel buttons (SettingsScreen, StoryGeneratorScreen), document the decision in DECISIONS.md. PENDING-DECISIONS #2 has the exact target classes and which buttons to leave alone (text-link tier for navigation).
3. **Scope the next deep-review pass** — bugs, UX polish, security polish, or flourishes. User wanted to pick scope in a fresh session. List is in the prior hand-off ("Next up" #2 from 2026-05-30 afternoon).

## Watch out for
- **On-disk worktree litter**: `.git/worktrees/` and `.claude/worktrees/` both still have 16+ leftover directories that Google Drive sync is holding. Every commit will still print ~16 lines of "Permission denied" — cosmetic only, commit succeeds. To clean: pause gdrive sync first, then `git worktree prune` + `rm -rf .claude/worktrees/* .git/worktrees/*`. Verify `git worktree list` still shows main afterward.
- **Untracked working files in main tree** (unchanged from prior hand-offs): `.pem` certs, `.gdoc` shortcuts, `go.js`, `go.vbs`, `mkcert-*.bat` helpers, `reviews/`. All user working files. Leave alone.
- **The lightened card overlay is unverified on phone.** If titles are now hard to read against bright photos (forest-evening especially), the fix is small — bump the middle stop back toward 0.55 in src/lib/sceneBackground.ts. Don't preemptively revert without seeing it.
- **PENDING-DECISIONS.md was refreshed this session.** #3 is now resolved (struck through); #2 moved from "decision needed" to "implementation queued"; #1 updated to reflect the new 25/45/85 overlay needs verification too. Read it before doing anything from the "Next up" list.
