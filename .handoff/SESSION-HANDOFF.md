# Session hand-off — 2026-07-02 (machine: crane-desk, abroad)
# (Older 2026-06-16 → 2026-07-01 hand-off history is preserved below this
#  block — but THIS block is the current state; read it first and treat the
#  rest as backstory.)

## STATE — 2026-07-02 (read this first)
- Branch: `main`, clean, synced with `origin/main` (0/0). Only the main
  worktree exists. Everything below is committed + pushed (HEAD `1369e5d`).
- The **clean-source audio refresh is CUT and LIVE on main**: 28 new George
  Vlad / FOBOS cuts across 6 scenes, all Opus on their prime offsets, tests
  254/254 green, SW cache bumped v7→v8. The one gate left is **Andrew's ear
  audition** (dashboard ready, see Next up #1). Also decided this session:
  **warm pad/drone is the default meditation bed** (supersedes singing bowls).

## Done this session (2026-07-01 → 02)
- **Pad/drone decision recorded** (`149d951`, DECISIONS.md + PENDING-DECISIONS
  0a): default meditation bed = warm ambient pad/drone. Build route: audition
  **99Sounds "Red Fog"** (free drone library) first, numpy/ffmpeg DSP synthesis
  as fallback; MusicGen stays rejected (failed by ear on bowls 2026-06-21).
  Bowls demoted to optional later texture (11 real recordings kept in
  `raw-sounds/`).
- **Loop-cut the sourced audio** (`ae3c357`): 28 cuts from
  `raw-sounds/_sources/` into `public/audio/<scene>/<element>/` — forest-day,
  forest-night (gained a proper 3rd element: night insects @409, African night
  source), forest-evening, monsoon (re-described as rainforest), ocean-night,
  fireplace. Pipeline: ffmpeg region cut → loudnorm I=-20 (distant layers also
  lowpassed 2800/3500 Hz) → FLAC intermediate → `loopify-scenes.py` → Opus at
  exact prime lengths. Sidecars written, 26 replaced MP3s deleted,
  `CACHE_VERSION` v8. Kept unchanged (no clean source yet): creeks, thunder,
  dockside, rain-on-window, singing-bowl.
- **loopify tool fixes** (`20bca82`): dropped the obsolete forest-evening copy
  job (was littering unreferenced files); ASCII-only prints (a `→` crashed the
  run mid-migration on Windows' cp1252 console).
- **Removed orphaned fireplace `distant-3`** (`1369e5d`) — unreferenced since
  May, surfaced when the audition dashboard counted 29 tracks instead of 28.
- **Audition dashboard built + opened**:
  `raw-sounds/_scope-refresh-2026-07-01/index.html` (28 tracks, spectrogram +
  scrubber each).

## Next up (2026-07-02)
1. **[ANDREW — the gate] Audition the 28 cuts** in the dashboard above. Ears
   only — spectrograms looked clean. One thing to listen for: forest-night
   `night-1`/`night-2` carry a steady single-frequency cricket line (authentic,
   but could read as "whine" at low volume). Flags → re-cut different regions
   from the same sources (they're 1–12 h long, plenty of material).
2. **Run `/code-review` over the recent changes** (Andrew asked for this,
   not yet run): `tools/loopify-scenes.py`, the `HowlScene.ts` `hasFadedIn`
   fix, `sceneCatalogue.test.ts`, this session's scene-JSON edits. Known item
   to weigh: `gen_beds()` regenerates the noise beds UNSEEDED on every run —
   pure binary churn when nothing changed (this session discarded it via
   `git checkout -- public/audio/_bed/`). Consider seeding or a skip-if-exists.
3. **Build the pad/drone meditation bed**: download/audition 99Sounds
   "Red Fog" → pick a candidate → voice it (HPF 80–100 Hz, 200–500 Hz dip,
   keep 2–4 kHz clear, ~15 dB under narration) → cut to a prime offset via
   the loopify pipeline → Andrew auditions.
4. Then back to the v1.0 roadmap `[ASK]`/`[DEVICE]` items: photos (4.3),
   meditation catalogue synthesis (6.5), device pass + tag (5.2).

## Watch out for (2026-07-02)
- **The app is already playing the NEW audio** — the refresh shipped before
  the ear audition (fine for a personal-use app; the dashboard is the formal
  gate, and re-cuts are cheap).
- **B1–B4 loop-seam bugs (2026-06-17) are probably mooted** by this refresh —
  forest-night wind and all ocean waves were replaced wholesale with new
  sources and the gapless fade-wrap method. Confirm during the audition, then
  close them in PENDING-DECISIONS §5.
- `gen_beds()` non-idempotency (Next up #2) — if you re-run
  `loopify-scenes.py` and only `public/audio/_bed/` shows as modified, that's
  the unseeded-noise churn; safe to `git checkout --` it.
- `tools/_build-level-candidates.sh` (untracked) + `raw-sounds/_candidates/`
  are still the retired 2026-06-21 litter — delete on a cleanup pass.
- Mixed `.mp3`/`.opus` in `public/audio/` is expected and supported during the
  scene-by-scene migration; don't "fix" it.

---
# ARCHIVED hand-off — 2026-07-01 (crane-desk, abroad)

## STATE — 2026-07-01 (superseded by the block above)
- Branch: `main`, clean, synced with `origin/main` (0/0). Only the main
  worktree exists. All work below is committed + pushed.
- The **clean-source audio refresh** is the active workstream. This session
  built the Opus pipeline, sourced 2 of 3 remaining scene gaps, fixed a real
  playback bug, and surfaced one decision that's waiting on Andrew.

## Done this session (2026-07-01)
- **Opus pipeline built + verified.** `tools/loopify-scenes.py` now emits Opus
  (libopus @ 48kHz — 44.1kHz is invalid for libopus, which broke the first
  run), converts any input format, and self-migrates a scene's JSON+sidecar
  to `.opus`. `HowlScene.ts` + `sceneCatalogue.test.ts` accept both `.mp3` and
  `.opus` for a scene-by-scene migration. 3 synth beds regenerated. 254/254
  tests pass, typecheck clean. (DECISIONS.md "Ship scene audio as Opus".)
- **Sourced 2 of 3 audio gaps** (both Opus, in `raw-sounds/_sources/`, gitignored):
  - **Ocean** — 2× George Vlad ~1h calm recordings (sandy + rocky Madagascar),
    `george-vlad-ocean/`. (Research wrongly said Vlad had no ocean — his *free
    YouTube* has it; found by direct search.)
  - **Fireplace** — 12h FOBOS PLANET source, `fireplace/` (818MB).
  - (Earlier: 10× George Vlad forest/rain/wind, `george-vlad/`, 656MB.)
- **Fixed a real playback bug** — `HowlLayer` re-faded from silence on every
  element replay (not just first), which could read as "background suddenly
  got loud." Guarded + regression test. NOT device-confirmed as THE cause of
  Andrew's report (see DECISIONS.md 2026-07-01 entry).
- **YouTube "throttle" was a false alarm** — it was `--download-sections` on
  test grabs, not a real limit. Whole-file grabs are full-speed. (Corrected in
  DECISIONS.md; don't re-investigate.)

## Next up (2026-07-01)
1. **[DECISION — Andrew] Meditation bed: singing bowls vs. warm pad/drone.**
   Research recommends switching the *default* meditation bed from the
   singing-bowl sound bath to a warm ambient pad/drone (bowl evidence is all
   passive standalone listening; pad/drone is what serves voice-over). This
   would supersede the 2026-06-30 singing-bowl-via-ElevenLabs-Music plan.
   **Hold the singing-bowl rebuild until Andrew rules.** (DECISIONS.md
   "OPEN RECOMMENDATION — meditation bed", PENDING-DECISIONS.)
2. **Loop-cut the sourced audio into `public/audio/`.** The mechanical core of
   the refresh, not yet started: place clips from `raw-sounds/_sources/` into
   the right `<scene>/<element>/` folders and run `loopify-scenes.py` per
   scene, then audition. Covers forest/rain/wind (Vlad), ocean (Vlad), and
   fireplace (FOBOS). Bump `CACHE_VERSION` in `public/sw.js` after.
3. **Audition everything by ear** before committing to `public/audio/` — the
   whole point of this refresh is cleanliness that spectrograms don't verify.
4. **Optional:** Freesound login if you want the CC0 Courter fireplace as a
   second variant (Andrew offered).

## Watch out for
- Nothing is loop-cut into `public/audio/` yet — the pipeline is ready but
  hasn't been pointed at the new source material. The app still plays the OLD
  (dirty) scene audio until that happens.
- `tools/_build-level-candidates.sh` (untracked) + `raw-sounds/_candidates/`
  are RETIRED litter from the superseded 2026-06-21 batch — ignore/delete on a
  cleanup pass; don't mistake for live work.
- Opus is scene-audio only; meditations/stories stay MP3/WAV (decided, not a
  TODO). iOS still deferred — verify Opus-in-`<audio>` before iOS ships.
- Leftover tooling from the throttle false-trail (Deno, bgutil provider) is
  harmless; leave installed.

## LEFTOVER WORK reconciled 2026-06-30 (read this first)
This hand-off was written *before* the scene-audio re-cut batch was touched. A
later stretch of the 2026-06-21 session (18:26–18:31, after the 18:02 hand-off
commit) **built the LEVEL slice of that batch** and never recorded it. So:
- 3 finished LEVEL candidates (ocean wave-1/wave-2, fireplace close-3), each a
  verified 251.000s seamless loop, plus an `AB/` compare set and a `scope/`
  audition dashboard, sit in `raw-sounds/_candidates/scene-audio-2026-06-21/`
  (gitignored, intact — nothing lost). Built by untracked, not-for-commit
  `tools/_build-level-candidates.sh`.
- **RETIRED 2026-06-30** — do NOT audition or promote them. The whole
  2026-06-21 re-cut batch is superseded by the clean-source refresh (we're
  redoing the audio wholesale from a new producer); these candidates and the
  rest of `_candidates/` are now just cleanup litter. See `PENDING-DECISIONS.md`
  #0a for the governing direction. Kept this note only so the build isn't
  rediscovered and mistaken for live work.

## STATE (read this first)
- Branch: `main`, clean, synced with `origin/main`. Ahead/behind 0/0.
- This was mostly a catch-up + content session. Caught up on the big
  **Howler html5 audio pivot** that landed via cloud PRs #7–#13 (the
  overnight-death problem is **solved** — 6h overnight confirmed), then did
  two pieces of follow-up: reconciled `CLAUDE.md` to the new engine, and
  expanded the **meditation catalogue from 3 to 10** by hand-writing 7 new
  scripts. The scripts are committed; their **audio is not generated yet** —
  that's one open action (needs your ElevenLabs key). **Also queued and now top
  priority:** a scene-audio re-cut batch — Andrew listened through all 44 layers
  on 2026-06-21 and flagged 15 (incl. rebuilding singing-bowl from real
  recordings); see PENDING-DECISIONS #0 + `notes/scene-audio-flags-2026-06-21.md`.

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
0. **(NOW TOP, updated 2026-07-01) Clean-source audio refresh — in progress.**
   Sourced and downloaded: George Vlad forest/rain/wind (10 files, 656MB,
   `raw-sounds/_sources/george-vlad/`) and a 12h fireplace source (818MB,
   `raw-sounds/_sources/fireplace/`). Ocean waves still needs a source
   (leading candidate: Earth.fm "Gentle Waves over Ancient Rocks" — not yet
   fetched). Singing-bowl direction decided (ElevenLabs Music bed + the real
   bowl recordings already in `raw-sounds/`) but not yet built.
   **The Opus pipeline is ready** (`loopify-scenes.py` emits Opus, code
   accepts it, beds regenerated, tests green) but **nothing has been loop-cut
   into `public/audio/` yet** — that's the actual next mechanical step: place
   source clips into the right scene/element folders and run
   `loopify-scenes.py` per scene. Full detail in `PENDING-DECISIONS.md` #0a-0d.
   This SUPERSEDES the 2026-06-21 re-cut batch (and its LEVEL candidates —
   retired).
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
