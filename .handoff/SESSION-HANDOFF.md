# Session hand-off — 2026-05-30 night (machine: desktop)

## STATE (read this first)
- Branch: `main`, clean working tree, synced with `origin/main` at `8216bcb`.
- Tests 113/113 green; `npm run typecheck` clean.
- **5 commits this session, pushed. GitHub Pages deploy succeeded** (CI + Pages
  both green on the tip). Deployed PWA carries `CACHE_VERSION v5` — reinstalling
  or refreshing pulls all of today's fixes (cleaned audio, new photo, UI).
- Dev server (`npm run dev`, port 5175) was up for phone testing; fine to leave
  or kill. Tailscale rule still points at 5175.
- Worktrees: only `main`. The per-commit "Permission denied" spam from
  `.git/worktrees/` litter is still cosmetic (Google Drive holds the handles) —
  see PENDING-DECISIONS #3.

## Done this session
- **Open on Tonight by default** (`afda504`) — removed the last-screen
  localStorage persistence; the app always lands on the scene picker now.
- **Faster scene onset** (`918bf34`) — the first-start fade was linear and sat
  sub-audible for ~1s ("is it playing?"). Now a front-loaded `pow(0.6)` curve
  via `Scene.fadeIn`'s new `shape` arg; cross-scene crossfade left linear.
- **Fireplace photo replaced** (`3d35282`) — placeholder → Unsplash (Elisabeth
  Arnold), flames-on-black; NOTICES updated. *Not yet eyeballed on-device.*
- **Forest wind-1 voices excised** (`02f8ebd`) — two muffled "voices from
  another room" at ~45.0–45.7s. Cut [44.80–45.90s] with an equal-power wind
  crossfade; 590→588.6s. `CACHE_VERSION` v4→v5.
- **`/audio-scope` skill** created (global, `~/.claude/skills/audio-scope/`) —
  generates a self-contained spectrogram + click-to-seek scrubber for any audio
  (own songs, renders from other programs). NOT in this repo.
- Seaside "pop" investigated (PCM + spectrogram) → no click found, not
  reproducible on device → **closed as artifact**.
- Phone walkthrough: loudness parity good, no body-scan pop, back button good,
  cards look great.

## Next up
1. **Content backgrounds** (headline feature) — stories play over an
   appropriate noise scene that *continues all night* after the narration ends;
   meditations over a singing-bowl sound bath. Wire ContentPlayerScreen +
   SceneCoordinator; for stories don't stop the scene on content end. Open
   sub-decision: which scene maps to which story. See memory
   `project_content_backgrounds` and PENDING-DECISIONS #1.
2. **Secondary-button sweep** (PENDING-DECISIONS #2) — still queued, ~30 min,
   style already decided.
3. **Confirm tonight's PWA install** from the deployed Pages build
   (PENDING-DECISIONS #5).

## Watch out for
- **Fireplace photo unverified on-device.** If it reads wrong on the card, two
  alternates (calmer embers / brighter logs) were staged this session — just
  ask to swap. Original user photo is in git history.
- **wind-1 is now 588.6s** (was 590), still > loop requirement (offset 521 +
  crossfade 5). Don't "restore" the old file — it has the voices.
- **`/audio-scope` lives in `~/.claude/skills`, not the repo** — it won't sync
  via git to the laptop. Copy/recreate it there if you want it on both machines.
- **Worktree litter** unchanged — cosmetic "Permission denied" on every git op;
  sweep recipe in PENDING-DECISIONS #3.
- **`.pre-loudnorm.mp3` backups** still in public/meditations + public/stories
  (gitignored) — safe to delete now that audio is validated (PENDING-DECISIONS #4).
