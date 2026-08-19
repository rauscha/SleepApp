# Session hand-off — 2026-08-19 (machine: desktop)
# Newest block. Everything below is prior history; this supersedes it for
# REPO STATE.

## STATE (read this first)
- Branch `main`, clean, synced with `origin/main` (0/0). HEAD `5abc2de`.
  Single worktree. Everything committed, pushed, **and deployed live**.
- The FTUS audio batch is **shipped and in production** at
  andrewrausch.com/SleepApp — verified serving (scene JSON, story index and
  audio all reachable, HTTP 206 range requests working). Andrew slept on it.
  20 new scene variants across six scenes, plus two new Glen-narrated sleep
  stories. CI + Pages green on every commit.
- The one substantive discovery: **`loopify-scenes.py` trims from t=0, which
  put each source's fade-in against its settled tail** — a 10-17 dB step at
  every loop wrap, on every file we have ever cut. Fixed for this batch by
  searching a per-file start offset that matches the wrap head to its tail
  (16 of 20 now wrap within 0.0-0.5 dB). **The tool itself is unchanged** —
  see "Next up" #1, this is the most valuable thing outstanding.

## Done this session
- Pulled all 20 picks from 161 GB of FTUS Gumroad ZIPs; corrected the pull
  list's ZIP mapping (WATER splits by category: 01-02 FLOW, 03-05 SURF,
  **06 TURBULENCE+WATERFALL** — the size model had put the waterfall trio in
  WATER_01 and ruled WATER_06 out). Lesson recorded: match by filename
  category prefix, not cumulative size.
- Checked and rejected WIND_01 (right material, but 308 s max against wind
  slots needing >=415/527 s — a duration wall, not quality) and WINDOWS_01
  (motorised curtain foley, not weather).
- Measured the 47 shipped variants: the catalogue was **never uniformly
  normalised** (-18.9 to -26.1 LUFS). New files are therefore normalised to
  their destination element's median, not a global target, so `defaultVolume`
  and the mix voicing still hold.
- Processing chain per file: front ORTF pair only -> `dynaudnorm` (~40 s
  window) -> **two-pass** `loudnorm` (linear; single-pass gates and pumps on a
  long noise bed) -> seam-matched trim.
- forest-night `night-ambience` re-keyed 409 -> 199 with 3 new cricket beds
  (old two removed); everything else **added alongside** existing variants for
  A/B. forest-night still shares forest-day's creeks.
- Two stories written and rendered with **Glen** (now exposed in
  `gen-story.ts`; it was meditation-only before, leaving Stone — a meditation
  voice — as stories' only male option). Fixed `durationSeconds` for all four
  stories: it was a `words/130*60` estimate, ~10% over on every entry.
- CACHE_VERSION v9 -> v11.

## Next up
1. **Teach the seam fix to `tools/loopify-scenes.py`.** Right now it still
   trims from 0, so the 10-17 dB wrap step returns for the next file anyone
   cuts, and every *previously* shipped variant likely still has it. The
   working algorithm is in this session's scratch (`seamfit.py`): decode a
   1 kHz mono envelope, search S over [0, dur-P-6] minimising
   |L(S) - L(S+P)|, penalise candidates whose wrap regions sit >4 dB off the
   file's mean. Consider auditing the pre-existing 45 variants the same way.
2. **[ANDREW] Audition, especially forest-night.** Two known-risky files:
   `night-ambience/night-4` (#233 — 5.0 dB residual seam, LRA 15.2, crow caws
   that could metronome at the 199 s loop; `night-5` same caveat, `night-3` is
   the safe pure-chorus anchor) and `rain-pavement/pavement-3` (#656 — 4.3 dB,
   gusty). Both re-cuttable from unused regions of the same sources.
3. **[ANDREW] waterfall-valley photos.** Blocked on one answer — see
   PENDING-DECISIONS 0A/A. Scene JSON staged at
   `notes/staged/waterfall-valley.scene.json`, its 4 audio files already
   processed and in `public/audio/waterfall-valley/`. ~20 min to wire once
   photos exist. Also needs a call on its third element (0A/B).
4. Remaining v1.0 roadmap `[ASK]`/`[DEVICE]`: photos (4.3), meditation
   synthesis (6.5), device pass + tag (5.2).

## Watch out for
- **`tools/_build-level-candidates.sh` must NOT be deleted.** The 2026-08-09
  block below says it is "safe to delete" because its logic "already lives in
  `tools/loopify-scenes.py`" — **that is wrong.** loopify does no levelling at
  all (its own header: "no loudnorm on scene files"). That script is the only
  record of the dynaudnorm -> loudnorm recipe this batch used. Still untracked;
  committing it is an open question for Andrew.
- **There is no "hidden scene" state.** `sceneCatalogue.test.ts` requires
  `public/scenes/` to match `index.json` exactly, which is why waterfall-valley
  is staged under `notes/` rather than shipped unlisted.
- **ElevenLabs Projects API returned 405** on both story renders; the
  chunked-TTS fallback handled them. Projects is the documented long-form path,
  so it may be gone or moved on this plan tier — check before a longer piece.
- `gen-story.ts` still estimates `durationSeconds` from word count. Committed
  values were corrected by hand; the tool needs an ffprobe dependency to fix
  properly.
- Three old unmerged branches exist (`backup/pre-rebase-2026-05-30`,
  `claude/objective-kirch-e41ce1`, `claude/optimistic-khayyam-1e864b`), all
  from May 2026 — i.e. before the June Howler pivot. Treated as litter per
  CLAUDE.md, deliberately NOT merged. Leave for a "deferred clean-up work" pass.
- Source material lives on `D:\Sounds` (161 GB of ZIPs, `picked/` 24 GB,
  `final/` the shipped renders) — **desktop-local, will not reach the laptop.**

---

# Session hand-off — 2026-08-09 (later: code-review fix plan EXECUTED)
# This block supersedes the two below for REPO STATE. The 2026-07-02 code-review
# fix plan is now fully done and pushed. Everything below is prior history.

## STATE — code-review fix plan complete (read this first)
- Branch `main`, synced with `origin/main` (0/0), single worktree. All work
  committed + pushed; nothing stranded.
- Executed `notes/code-review-2026-07-02/fix-plan.md` end to end, both phases
  (all 18 checkboxes ticked):
  - Phase 1 (S1–S7): UTF-8 on every open() in loopify-scenes.py; bed-churn skip
    guard + seeded anoisesrc; truthful 48 kHz sidecar metadata; repaired em-dash
    mojibake in 5 scene JSONs; corrected forest-night wind attributions to George
    Vlad; crash-safe migration write-ordering; hard "missing sidecar fails" scene
    test (+ backfilled fireplace close-1 sidecar).
  - Phase 2 (O1–O3): O1 — a running sleep-timer fade is no longer cancelled by an
    element replay or a gain change (re-enters the fade over remaining wall time;
    +2 regression tests). O2 — Howler `format` derived per-src (howlFormats) so
    `.mp3` layers aren't opus-gated / iOS-silent (+3 tests). O3 — unblocked and
    RAN the MP3→Opus migration: all 7 remaining MP3 scenes now Opus (19 files
    transcoded, cross-scene forest-night creek rewrite intact), `public/sw.js`
    CACHE_VERSION v8→v9.
  - Fix commits `3c23660..883e47e` (10) + this bookkeeping commit.
  - Green: `npx tsc --noEmit` clean; `npx vitest run` 259/259 (was 254; +5 new
    regression tests). `python tools/loopify-scenes.py` is idempotent (all skip,
    clean tree, beds skipped).
  - O3 step 5 (drop `mp3` from accepted formats) intentionally LEFT during the
    ear-audition window — no `.mp3` remain, so the tolerance is harmless.
- **Remaining v1.0 gates UNCHANGED**: [ANDREW] audition the 28 refreshed cuts;
  pad/drone meditation bed (PENDING #0a); roadmap photos (4.3), meditation
  synthesis (6.5), device pass + tag (5.2).
- Untracked `tools/_build-level-candidates.sh` still left as-is (retired litter).

---

# Session hand-off — 2026-08-09 (machine: laptop)
# (The 2026-07-04 block below is STILL the accurate project state and the real
#  priority list. Today changed NOTHING in the repo and was source research only
#  — read this block, then treat the 07-04 block as the live plan.)

## STATE — 2026-08-09 (read this first)
- Branch: `main`, clean, synced with `origin/main` (0/0). Single worktree.
  HEAD `29f8991`, unchanged since the 2026-07-04 hand-off. **Nothing stranded;
  nothing new committed this session.**
- Today was an **audio-source exploration only**, done entirely OUTSIDE the repo.
  Durable output is on Drive (not git): `file-transfers/Sounds/klankbeeld-descriptions.md`
  — a 21-file klankbeeld catalogue stripped from the raw docx, with a scene-mapping
  table + analysis-derived clean-loop windows. Proof loops + audio-scope pages are
  under `%TEMP%/klank/` (laptop-local — will NOT reach the desktop).
- ⚠ **Much of today is superseded.** The project pivoted to **personal-use /
  non-commercial** (2026-06-30, memory `reference-audio-licensing`), which relaxes
  the commercial-license constraint today's CC-BY analysis was built around; and a
  **George Vlad / FOBOS clean-source refresh (28 cuts) already shipped** (`ae3c357`).
  Treat today's klankbeeld/CC-BY work as *supplementary* source research, not a new
  front. Active driver = audio QUALITY, not license.

## Done this session (2026-08-09)
- Reviewed the Free To Use Sounds license (commercial standalone → needs a paid
  Developer License). Moot under the personal-use stance; analysis retained in
  memory `reference-audio-licensing` in case commercial returns.
- Built `file-transfers/Sounds/klankbeeld-descriptions.md`: 21 klankbeeld cuts
  (all creator-labelled **CC BY 4.0**), durations/loop-fit, artifact watch-outs, a
  proposed scene map (incl. a new **Dockside/harbour** scene from the marina rigging
  clip), and clean-loop windows from an envelope/event + bird-density analysis.
- Located clean windows around flagged artifacts (the "laughing man" 17:14 in
  859878 → clean 22:44–27:03; bird-sparse forest 857747 @ 1:14–5:33) and rendered
  5 proof loops (LRA 3.6–7.3, far steadier than the old amateur files).
- Gap sourcing (CC0/CC-BY): **fireplace = visionear 501417 (CC0, 11:54, 48k/24)**;
  singing-bowl = real-CC0 layering (hollandm 573805 + strikes), synthetic drones
  rejected. NB the meditation bed has since moved to a **pad/drone** (PENDING #0a),
  so the bowl work is optional.

## Next up (2026-08-09) — unchanged from 2026-07-04
1. **Execute the code-review fix plan** — `notes/code-review-2026-07-02/fix-plan.md`
   (Phase 1 Sonnet → hard STOP → Phase 2 Opus). Most-severe: O1 `hasFadedIn`
   sleep-timer snap, O2 Howler positional `format` (iOS-silent), S1/S4 mojibake.
2. **[ANDREW — the gate] Audition the 28 refreshed cuts** —
   `raw-sounds/_scope-refresh-2026-07-01/index.html`. Listen for the cricket line
   in forest-night night-1/night-2.
3. **Build the pad/drone meditation bed** (PENDING #0a) — not singing bowls.
4. v1.0 roadmap `[ASK]`/`[DEVICE]`: photos (4.3), meditation synthesis (6.5),
   device pass + tag (5.2).

## Watch out for (2026-08-09)
- Untracked `tools/_build-level-candidates.sh` — a throwaway from the superseded
  freetousesounds LEVEL-fix batch. **CORRECTED 2026-08-19: its logic does NOT
  live in `tools/loopify-scenes.py`** — loopify does no levelling at all. That
  script is the only record of the dynaudnorm -> loudnorm recipe, which the
  2026-08-18 FTUS batch used. Do NOT delete. Still untracked.
- Today's proof loops + audio-scope live under `%TEMP%/klank/` on the LAPTOP only.
  The durable artifact is `file-transfers/Sounds/klankbeeld-descriptions.md` (on Drive).
- Don't re-open the commercial-license thread unless the personal-use decision
  reverses (memory `reference-audio-licensing`).

---

# Session hand-off — 2026-07-04 (machine: crane-desk)
# (Older 2026-06-16 → 2026-07-02 hand-off history is preserved below this
#  block — but THIS block is the current state; read it first and treat the
#  rest as backstory.)

## STATE — 2026-07-04 (read this first)
- Branch: `main`, clean, synced with `origin/main` (0/0). Only the main
  worktree exists. Everything is committed + pushed (HEAD `64c02ee`).
- **The `/code-review` is DONE and its fix plan is written to disk** —
  `notes/code-review-2026-07-02/fix-plan.md`. That closes the "run the code
  review" action from the last hand-off. The review found **10 verified
  issues** (9 confirmed, 1 latent) in the audio-refresh commits; none are
  shipped-audio-breaking today, but one (the `hasFadedIn` fade-snap) defeats
  the sleep timer and should land before the v1.0 tag.
- **Nothing has been fixed yet** — this session only *planned* the fixes. The
  plan is built to be executed by a fresh session with no context, and is
  **split into two phases with a hard STOP POINT between them**: Phase 1
  (S1–S7) is mechanical, sized for Sonnet; Phase 2 (O1–O3) needs judgment,
  sized for Opus. The model was switched to Opus at the end of this session.
- Andrew's **ear audition of the 28 refreshed cuts is still the open gate**
  (unchanged from 2026-07-02) — dashboard at
  `raw-sounds/_scope-refresh-2026-07-01/index.html`.

## Done this session (2026-07-04)
- **Ran `/code-review` (high effort)** over the audio-refresh range
  `9321c55..1369e5d`: `tools/loopify-scenes.py`, the `HowlScene.ts`
  `hasFadedIn` fix, `sceneCatalogue.test.ts`, and the scene-JSON edits.
  8 finder angles → dedup → verify → **10 findings** (9 CONFIRMED, 1
  PLAUSIBLE). Nothing committed as a fix — findings only.
- **Wrote the fix plan** (`64c02ee`): `notes/code-review-2026-07-02/fix-plan.md`.
  Every finding has a file:line anchor, the exact fix, and acceptance checks;
  ground rules (commit style, auto-push, CACHE_VERSION-on-audio, worktree spam,
  scene invariants) are restated inline so a context-free session can run it.
  Two findings are **coupled** — fixing the loopify too-short guard (O3-A)
  without the cross-scene URL rewrite (O3-B) would break forest-night's creek;
  the plan forces them into one step.

## Next up (2026-07-04)
1. **Execute the fix plan** — `notes/code-review-2026-07-02/fix-plan.md`.
   - **Phase 1 (Sonnet):** switch model to Sonnet, say "execute Phase 1 of
     the fix plan." It STOPS itself at the barrier after S1–S7.
   - **Phase 2 (Opus):** then switch to Opus and say "execute Phase 2."
   - Most-severe items: O1 (`hasFadedIn` cancels a running sleep-timer fade →
     full-volume snap + hard cut), S1+S4 (cp1252 mojibake, already committed in
     5 scene JSONs), O2 (Howler `format` list is positional, not fallback →
     every layer silent on iOS Safari — ambushes roadmap 5.2).
2. **[ANDREW — the gate] Audition the 28 cuts** (dashboard above). Listen for
   the steady cricket line in forest-night `night-1`/`night-2`. Flags → re-cut
   from the same long sources.
3. **Build the pad/drone meditation bed** — audition 99Sounds "Red Fog" →
   voice it (HPF 80–100 Hz, 200–500 Hz dip, keep 2–4 kHz clear, ~15 dB under
   narration) → loopify to a prime offset → Andrew auditions.
   (`PENDING-DECISIONS.md` #0a.)
4. Then the v1.0 roadmap `[ASK]`/`[DEVICE]` items: photos (4.3), meditation
   catalogue synthesis (6.5), device pass + tag (5.2).

## Watch out for (2026-07-04)
- **The fix plan's O3 re-encodes shipped audio** for the 7 scenes still on MP3
  (21 variant URLs — the review's "19" undercounted). It does NOT touch the 28
  fresh audition cuts (already Opus), so it won't collide with Andrew's ear
  pass — but if unsure, land O3's tool fixes and ask before running the
  migration.
- **Phase 1 → Phase 2 is a real gate, not a formality.** Phase 2's O1/O2
  involve subtle Howler-internals semantics (a `volume()` call cancels a
  running fade; the `format` array pairs positionally with `src`) that are easy
  to get wrong — don't let a small model wander past the STOP POINT.
- Everything the previous hand-off flagged still holds: the app already plays
  the NEW audio (refresh shipped ahead of the audition — fine for personal
  use); mixed `.mp3`/`.opus` in `public/audio/` is expected during migration;
  `gen_beds()` churn is real (the plan's S2 fixes it).
- `tools/_build-level-candidates.sh` (untracked) is still retired 2026-06-21
  litter — leave it or delete on a cleanup pass; not live work. A stray
  `NEXT_STEPS.md` also sits in an orphaned `.claude/worktrees/` dir (Drive
  litter, not a registered worktree — `git worktree list` shows only `main`);
  ignore it, don't hand-edit it.

---
# ARCHIVED hand-off — 2026-07-02 (crane-desk, abroad)

## STATE — 2026-07-02 (superseded by the block above)
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
