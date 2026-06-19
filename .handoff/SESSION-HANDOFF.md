# Session hand-off — 2026-06-16 (machine: laptop)

## STATE (read this first)
- Branch: `main`, clean, synced with `origin/main`. Ahead/behind 0/0.
- This was mostly a catch-up + content session. Caught up on the big
  **Howler html5 audio pivot** that landed via cloud PRs #7–#13 (the
  overnight-death problem is **solved** — 6h overnight confirmed), then did
  two pieces of follow-up: reconciled `CLAUDE.md` to the new engine, and
  expanded the **meditation catalogue from 3 to 10** by hand-writing 7 new
  scripts. The scripts are committed; their **audio is not generated yet** —
  that's the top next action and it needs your ElevenLabs key.

## Done this session
- **Caught up on the Howler pivot** (PRs #12/#13): production scene bed now
  runs through Howler `html5` (`src/audio/howl/`), OS owns each loop; the old
  Web Audio keep-alive/element-sink/watchdog stack is gone. Web Audio engine
  retained for the dev harness/tests only. (All recorded in DECISIONS.md.)
- **Reconciled `CLAUDE.md`** to that reality — commit `48c69da` (pushed).
  Scene-authoring rule #3 flipped from "variant longer than offset+crossfade"
  to "variant length **==** prime offset"; audio-engine invariants rewritten
  around `HowlScene`/`HowlScenePlayer`; file-layout + current-focus updated.
- **Closed draft PR #11** ("element-sink stall watchdog") as obsolete — it
  guarded the Web Audio path the pivot deleted.
- **Resolved roadmap 6.5**: invest in meditations (not cut). Hand-wrote 7 new
  sleep-meditation scripts (distinct techniques: PMR, 2 breath, 4
  visualization, 1 cognitive-shuffle), expanded all to ~8 min, committed
  `bb4a046`. Existing 3 scripts left unchanged.

## Also landed on main (overnight cloud build — not this session)
While this session ran, an overnight listening/build batch pushed to
`origin/main` (commits `210c363`..`56262df`); I rebased my two commits on top
of it. Status (full notes in `notes/bug-reports-2026-06-17.md`):
- **B5 done** (Forest Day birds 0.35→0.25). **B6** app-shell→`100svh` fix
  shipped, needs device-verify (not a v1.0 blocker). **B7** story-durability
  mitigations shipped — but root cause is device-dependent and it is a
  *possible data loss* (a generated story, "astronomer", vanished overnight).
- **B1–B4 are BLOCKED on source audio** — loop-seam/level defects (Forest-Night
  plane artifact, linear→equal-power loop crossfade for `loopify`, mid-clip A→B
  loop points, Ocean-Night swell seam) that need the original scene audio +
  your ears. Branch `claude/forest-night-audio-crossfade-f5w5ws` exists for
  this (no open PR). See PENDING-DECISIONS.

## Next up
1. **Synthesize the meditations** (needs `ELEVEN_LABS_API_KEY`). Run the
   `gen-meditation.ts --script ...` commands in `PENDING-DECISIONS.md` #1 —
   re-render the 3 existing + generate the 7 new — and QC the voices.
2. **After synthesis (my part):** bump `CACHE_VERSION` in `public/sw.js`
   (re-rendered 3 reuse filenames → stale cache otherwise), commit
   `public/meditations/` (MP3s + index.json), check off roadmap 6.5.
3. **Remaining v1.0 items:** 4.3 replace 3 off-brief photos `[ASK]` (you
   source images); 5.2 device pass + tag `v1.0.0` `[DEVICE]`.
4. **Self-voice clone:** once you have the cloned ElevenLabs voice ID, I wire
   it into `VOICE_IDS` in `tools/gen-meditation.ts` + the `VITE_VOICE_*` env.

## Watch out for
- **The 7 new meditations won't appear in the app yet** — `index.json` still
  lists only the 3 originals. They show up only after you run the tool.
- On re-renders, **`--voice` must match the original** (body-scan-01=hush,
  breath-01=ember, forest-01=glen) or it synthesizes in the wrong voice.
- The app's **displayed duration is a word-count estimate** (`words/115`) and
  under-reports real audio — every script runs ≥8 min spoken (esp.
  quiet-shuffle, whose per-image pauses the estimate ignores).
- **SW cache bump is mandatory** when committing the re-rendered 3 (same
  filenames) or the old cached audio sticks on devices.
- **B7 (overnight): possible story data loss** — mitigations shipped, root
  cause device-dependent; watch whether generated stories vanish.
- **B1–B4 audio-seam bugs need your source audio** — not fixable in-repo from
  the trimmed MP3s. See PENDING-DECISIONS.
- Worktree/Drive "Permission denied" spam on git ops is expected and
  cosmetic. Safe = committed + pushed on `main` (it is).
