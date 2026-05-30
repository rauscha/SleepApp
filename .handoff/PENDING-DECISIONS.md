# Pending decisions

Three items from the 2026-05-30 overnight run waiting on your input. None blocks tonight's sleep test. Detail and recommendations in `OVERNIGHT-LOG-2026-05-30.md` under "Waiting on you."

## 1. Verify scene cards on 375px iPhone SE  (Appendix D, P1)
- Open `https://crane-desk.saiga-wage.ts.net/SleepApp/` at 375px (or on the phone over Tailscale).
- Walk Tonight → Library → Player → Settings.
- Check: horizontal scroll on scene cards, overflow on long scene descriptions, timer-picker row wrap, bottom-nav label squeeze.
- If anything looks off, queue a focused next session to fix.

## 2. Pick a single secondary-button style  (Appendix D, P1)
- Three coexisting styles: gray pill, ghost border, filled ink. Three radii: `rounded-soft`, `rounded-softer`, ad-hoc.
- Recommended consolidation: ghost border (moon-300 outline, as in "Generate new story" button) for secondary CTAs; `rounded-soft` everywhere.
- Once you decide, a 30-min sweep can migrate everything and document the choice in `DECISIONS.md`.

## 3. Clean up `.git/worktrees/*` stale directories  (cosmetic)
- Every commit tonight printed 12 lines of `error: failed to delete '.git/worktrees/<name>': Permission denied`. Commits succeeded; this is just stale metadata Windows can't delete while Git holds a lock.
- To clear: `git worktree prune`, then manually `rm -rf .git/worktrees/<name>` for any that remain.
- **Wait until no other Claude session is active in a worktree before doing this** — risk of clobbering another session's branch metadata otherwise.
