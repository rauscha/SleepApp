# Pending decisions

Items deferred during prior sessions, waiting on your input. None blocks tonight's sleep test. Refreshed 2026-05-30 evening.

## 1. Verify scene visuals on 375px iPhone SE  (Appendix D, P1 — still the top priority)
- Photos now exist for all 7 scenes (forest-evening, monsoon, ocean-night added earlier today).
- Player backgrounds the scene photo with a heavier overlay during Lush, then crossfades to black for Nightstand over 1800ms.
- **Card overlay was lightened today** from 35→55→95% to 25→45→85% (commit `6428191`) — *this still needs eyeballs on a real phone*. If it's now too light and titles are hard to read against bright photos (forest-evening especially), bump the middle stop back up (try 25→50→85% or 25→55→85% before going all the way back).
- Open `https://crane-desk.saiga-wage.ts.net/SleepApp/` at 375px (or the phone over Tailscale, after restarting the dev server). Walk Tonight → Library → Player → Settings. Watch for:
  - **Card overlay** — new 25/45/85 mix. Does the title still float cleanly, or does it disappear into the photo?
  - **Player overlay legibility** under the volume slider, mixer disclosure, Stop button. 55→70→92% gradient. Verify it's not too dim against bright sources (forest-evening especially).
  - **Crossfade timing** (1800ms) — does it feel like an exhale, or laggy on the way in / abrupt on the way out?

## 2. Secondary-button consolidation — DECIDED, implementation queued
*(Decision made 2026-05-30 evening: style A, ghost border.)*
- **Target style**: `border border-moon-700 rounded-soft text-moon-300 hover:text-moon-200 px-3 py-1.5 ui-label transition-colors duration-slow`. Match the "Generate new story" button in LibraryScreen as the canonical example.
- **Migrate**: the gray-pill Cancel buttons in SettingsScreen.tsx:315-319 and StoryGeneratorScreen.tsx:219-224 ("Cancel" twice). Both currently use `bg-ink-700 text-stone-300 rounded-soft`.
- **Leave alone (text-link tier)**: pure-text back arrows (`← Back`, `← Scenes`) and inline row actions in Library (Play / Delete) — these are link-style by intent, not buttons. Two-tier hierarchy: A for "do something" CTAs, text-link for navigation and row-inline actions.
- **Document**: append the decision and rationale to `DECISIONS.md` as the same commit.
- Estimated 30 minutes including a typecheck + test pass.

## 3. ~~Stale `.claude/worktrees/`~~ — resolved 2026-05-30 evening
- All three worktrees (`optimistic-robinson-b36490`, `distracted-euclid-22b22a`, `objective-kirch-e41ce1`) were confirmed subsumed by main and removed from git's view. `git worktree list` now shows only main.
- **Lingering wart**: the on-disk admin directories at `.git/worktrees/<name>/` and the worktree dirs at `.claude/worktrees/<name>/` could NOT be deleted — Google Drive sync was holding file handles. Git no longer references any of them, so they're functionally harmless, but the "Permission denied" noise on every commit will continue until they're swept. To clean later: pause Google Drive sync, then `git worktree prune` followed by `rm -rf .claude/worktrees/* .git/worktrees/*` (then `git worktree list` to confirm main is still healthy). Low priority — purely cosmetic.

## 4. Verify normalized voice content on phone
- 5 voice MP3s were re-rendered earlier today via `tools/normalize-existing-content.sh`. CACHE_VERSION bumped v3 → v4 so PWAs invalidate the old audio.
- Listen to body-scan-01 and seaside-village on the phone:
  - **Loudness parity**: body-scan should now be about the same level as seaside (was 12 dB louder pre-fix; measured difference is now ~1 dB).
  - **Story pop test**: confirm the "soft pop ~10s in" is gone for seaside-village and night-train. The re-encode pass fixed MP3 frame corruption at chunk seams (ffmpeg flagged "Header missing" errors during loudnorm). User-facing test is the listen.
- Backups left at `*.pre-loudnorm.mp3` (gitignored). Once happy, delete:
  ```
  rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3
  ```

## 5. PWA install not working from Tailscale dev URL
- User flagged earlier today during walkthrough, said don't fix now.
- Likely cause: dev server doesn't run the `swPrecachePlugin` (build-only via vite.config.ts), so the manifest's `start_url` works but the SW precache array is empty. Probably resolves against the deployed Pages build or a local `vite preview` run.
- Not urgent. Worth a 10-min verification on the deployed site before formally closing.
