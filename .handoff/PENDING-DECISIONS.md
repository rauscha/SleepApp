# Pending decisions

Items deferred during prior sessions, waiting on your input. None blocks tonight's sleep test. Refreshed 2026-05-30 afternoon.

## 1. Verify scene visuals on 375px iPhone SE  (Appendix D, P1 — partially addressed)
- Photos now exist for all 7 scenes (forest-evening, monsoon, ocean-night added today).
- Player backgrounds the scene photo with a heavier overlay during Lush, then crossfades to black for Nightstand over 1800ms.
- Open `https://crane-desk.saiga-wage.ts.net/SleepApp/` at 375px (or the phone over Tailscale). Walk Tonight → Library → Player → Settings. Watch for:
  - **Tonight card overlay may now be too heavy** over real photos — it was tuned when only forest-day/-night/rain-on-window/fireplace had photos and the rest were gradient-only. Card overlay is 35→55→95% dark; might want to drop to 25→45→85% to let the photo carry more.
  - **Player overlay legibility** under the volume slider, mixer disclosure, Stop button. Heavier 55→70→92% gradient was chosen for this; verify it's not too dim against bright sources (forest-evening especially).
  - **Crossfade timing** (1800ms) — does it feel like an exhale, or laggy on the way in / abrupt on the way out?

## 2. Pick a single secondary-button style  (Appendix D, P1)
*(Carried over from prior session — still open.)*
- Three coexisting styles: gray pill, ghost border, filled ink. Three radii: `rounded-soft`, `rounded-softer`, ad-hoc.
- Recommended consolidation: ghost border (moon-300 outline, as in "Generate new story") for secondary CTAs; `rounded-soft` everywhere.
- Once decided, a 30-min sweep can migrate everything and document the choice in `DECISIONS.md`.

## 3. Stale `.claude/worktrees/` — now more complex
*(Cherry analysis today disagrees with the previous handoff's assertion of "all rebase replays.")*
- **`optimistic-robinson-b36490`** — every commit is in main via patch-id match. Safe to drop:
  ```
  git worktree remove .claude/worktrees/optimistic-robinson-b36490
  ```
- **`distracted-euclid-22b22a`** and **`objective-kirch-e41ce1`** — each contains commit `19f3ff3` "Three new scenes" (May 28) that is NOT in main as the same patch. Main has the scenes but with later sub-element refinements (rain-distant, thunder-rumble, dockside-distant, waves-far, creek-trickle for forest-evening). Likely obsolete, but the worktree has `forest-evening/forest-rain/forest-2.mp3` that doesn't exist under that name in main.
- Suggested investigation:
  ```
  git diff --stat main...claude/distracted-euclid-22b22a -- public/audio
  git diff --stat main...claude/objective-kirch-e41ce1 -- public/audio
  ```
  Audition any mp3 the worktree has that main doesn't. If they're field recordings worth keeping, cherry-pick them onto a new branch and merge to main. If superseded, then `git worktree remove`.
- **Do NOT `git worktree remove --force` blindly.** This is the recurring worktree-pain pattern.

## 4. Verify normalized voice content on phone
- 5 voice MP3s were re-rendered today via `tools/normalize-existing-content.sh`. CACHE_VERSION bumped v3 → v4 so PWAs invalidate the old audio.
- Listen to body-scan-01 and seaside-village on the phone:
  - **Loudness parity**: body-scan should now be about the same level as seaside (was 12 dB louder pre-fix; measured difference is now ~1 dB).
  - **Story pop test**: confirm the "soft pop ~10s in" is gone for seaside-village and night-train. The re-encode pass fixed MP3 frame corruption at chunk seams (ffmpeg flagged "Header missing" errors during loudnorm). User-facing test is the listen.
- Backups left at `*.pre-loudnorm.mp3` (gitignored). Once happy, delete:
  ```
  rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3
  ```

## 5. PWA install not working from Tailscale dev URL
- User flagged today during walkthrough, said don't fix now.
- Likely cause: dev server doesn't run the `swPrecachePlugin` (build-only via vite.config.ts), so the manifest's `start_url` works but the SW precache array is empty. Probably resolves against the deployed Pages build or a local `vite preview` run.
- Not urgent. Worth a 10-min verification on the deployed site before formally closing.
