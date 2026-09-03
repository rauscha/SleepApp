# Pending decisions / queued actions

## 0A. RESOLVED 2026-09-03 — the 2026-08-18 FTUS follow-ups

All four items from the 2026-08-18 block are closed (log in
`.handoff/OVERNIGHT-LOG-2026-08-18.md` for the original context):

- **A. waterfall-valley photo** — Andrew supplied seven of his own shots on
  2026-09-02; the mossy gorge falls was used, tone-curved down to the
  catalogue's night luminance. Scene shipped.
- **B. third element** — `creek-below` @199, two variants from WATER_06
  (Small Creek 04, Front and Rear Flow), voiced at 0.25. Andrew said reuse
  was fine, so "unused elsewhere" was never a constraint. Level is a
  starting point for the ear — three water layers may want it lower.
- **C. seams** — Andrew: a 5 dB step is notable; the crows are not a
  problem. `loopify-scenes.py` now searches the loop start
  (`tools/seamfit.py`, DECISIONS.md 2026-09-02) and night-4 / night-5 /
  pavement-3 / wave-4 were re-cut to <1 dB. night-5's seam sits ~7 dB under
  the file's mean (only 14 s of slack) — flat, but quiet; listen.
- **D.** (1) `gen-story.ts` duration estimate — still open, needs ffprobe.
  (2) ElevenLabs Projects 405 — still open. (3) the leveling recipe is now
  `tools/level-ftus.py`; `tools/_build-level-candidates.sh` remains
  untracked litter (its 2026-06-21 candidates are superseded) — Andrew's
  call whether to delete it.

**Still open from the audit** (`notes/loop-seam-audit-2026-09-02.md`):
12 shipped variants over 3 dB. Seven re-cut cleanly from the hour-long
George Vlad masters in `raw-sounds/_sources/` (wind-1 9.8 dB, wave-3 8.4,
far-1 7.8, forest-2 4.6, birds-2 3.8, far-2 3.8, wind-2 3.5) plus rumble-2
from the Pixabay thunder file; a re-cut may land on different material
from the same master, so it wants an ear afterwards. The four singing-bowl
files (19 / 17 / 10 / 7 dB) are MusicGen stitches with no intermediate on
disk — replace, don't re-cut (DECISIONS.md 2026-07-01 already demoted them).

Refreshed 2026-06-21. Older pre-pivot items have been resolved or folded into
the Howler pivot and the v1.1 roadmap — see the note at the bottom.

## 0a. GOVERNING DIRECTION — clean single-producer audio source (2026-06-30)
Supersedes the licensing rationale below. Two pivots, both now recorded in
DECISIONS.md (2026-06-30 entry) + memory:
- **klankbeeld is REJECTED.** The plan to refresh every layer onto one clean
  CC BY 4.0 source (klankbeeld, 22 files staged in GDrive `Personal-Apps-Sounds`)
  failed on contact: the recordings were too dirty (people/cars/birds), needing
  too many cuts per file. Premise collapsed.
- **SleepApp is now personal-use / non-commercial, for now.** License stops
  being the driver (personal/Pixabay/RemArc all OK again); **audio QUALITY is
  the driver.** Revisit license only if a commercial ship returns.
- **SOURCE DECIDED 2026-06-30 — George Vlad / Mindful Audio.** Practitioner
  search (deep-research, 102 agents) ranked him #1; full writeup in
  `notes/audio-source-research-2026-06-30.md`. Single recordist, pristine
  remote field recordings, 18+ paid libraries — but his **free YouTube
  channel** (long-form, often 1-2h+, several explicit 12h "no loop" all-night
  files) is the same recording quality and was judged not-worth-paying-for
  for this app (see the Opus-format decision below — the thing that mattered,
  cleanliness, doesn't improve with the paid 24/96 WAV for a downsampled
  overnight loop bed). GAPS confirmed: no ocean surface waves, no fireplace,
  no singing bowls — need a separate source for those three scenes.
- **GRAB COMPLETE 2026-06-30 18:28** (took ~2.5 min, not overnight — see the
  corrected throttle finding below). `raw-sounds/_sources/george-vlad/` has
  all 10 curated long-form videos as **Opus** (656 MB total, no re-encode —
  see "ship as Opus" decision below): monsoon/rain (2), forest-day (4),
  forest-night (1), forest-evening (1), pure-wind (2). List/mapping in
  `_grab-list.tsv` in that dir.
- **Opus pipeline READY 2026-07-01** — `tools/loopify-scenes.py` now emits
  Opus (libopus, 48kHz — 44.1kHz isn't a valid libopus rate, this tripped the
  first attempt), accepts any input format, and migrates a scene's JSON +
  sidecar to `.opus` in place when it converts a file. The 3 synth beds
  (`public/audio/_bed/{brown,pink,white}.opus`) are already regenerated and
  verified (887.0065s, 48kHz). `HowlScene.ts` and `sceneCatalogue.test.ts`
  accept both `.mp3` and `.opus` during the migration. All 254 tests pass,
  typecheck clean.
- **LOOP-CUT COMPLETE 2026-07-02** (commit `ae3c357`): 28 cuts from the Vlad /
  FOBOS sources across 6 scenes (forest-day/night/evening, monsoon,
  ocean-night, fireplace), all Opus on their prime offsets, loudnorm I=-20,
  sidecars written, 26 replaced MP3s deleted, `CACHE_VERSION` → v8, 254/254
  tests green. Forest-night gained a 3rd element (night insects @409). Kept
  unchanged (no clean source yet): creeks, thunder, dockside, rain-on-window,
  singing-bowl. **REMAINING GATE: Andrew's ear audition** — dashboard at
  `raw-sounds/_scope-refresh-2026-07-01/index.html` (28 tracks); flags → re-cut
  other regions from the same long sources.
- **Fireplace gap: ACQUIRED 2026-07-01** — 12h FOBOS PLANET fireplace source
  in `raw-sounds/_sources/fireplace/` (818 MB Opus).
- **Ocean gap: ACQUIRED 2026-07-01** — two ~1h George Vlad calm-ocean
  recordings (sandy-beach + rocky-beach Madagascar) in
  `raw-sounds/_sources/george-vlad-ocean/` (~55 MB each, Opus). The
  deep-research passes wrongly said Vlad had no ocean (they only checked his
  paid catalogue); his free YouTube has it. Found via direct WebSearch after
  the harness rate-limited on that exact angle. Beats the paid/aggregator
  alternatives. See DECISIONS.md "Ocean waves + fireplace sourcing".
- **Singing-bowl gap: RESOLVED 2026-07-01 — replaced by pad/drone.** The
  design-question research pass came back favoring a warm ambient pad/drone
  as the default meditation bed (bowl evidence is passive standalone
  listening only; failed adversarial verification for "bed under a voice").
  **Andrew accepted same day** — see DECISIONS.md "DECIDED — warm pad/drone
  is the default meditation bed". Build route: audition 99Sounds "Red Fog"
  first, numpy/DSP synthesis fallback; MusicGen stays rejected. Singing
  bowls demoted to optional later texture (real bowl recordings kept in
  `raw-sounds/`); the ElevenLabs-Music bowl-bed plan is superseded.
- **RESOLVED 2026-06-30:** the clean-source refresh **SUPERSEDES** the
  2026-06-21 re-cut batch entirely. We are redoing the audio from the new
  source, so:
  - The built LEVEL candidates (ocean wave-1/wave-2, fireplace close-3) are
    **retired** — not needed, don't audition or promote them. They can be
    deleted with the rest of the `_candidates/` litter on a cleanup pass.
  - The batch's RECUT/REPLACE/REBUILD plan is **dropped** as a plan; its only
    lasting value is the per-layer *quality* notes in
    `notes/scene-audio-flags-2026-06-21.md`, which document what each new
    layer needs to beat.
- **Andrew granted permission (2026-06-30) to download candidate audio to
  disk** from the running practitioner search's recommendations — fetch good
  candidates into the `raw-sounds/` dump (gitignored), then audition before
  committing any into `public/audio/`. Specifics:
  - **yt-dlp grabs are pre-cleared up to ~10 GB total** (they're free); ask
    Andrew before exceeding 10 GB. yt-dlp 2026.03.17 is installed; point it at
    ffmpeg via `--ffmpeg-location "C:/Users/andre/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1-full_build/bin"`
    (the WinGet `Links` shim is permission-denied under the bash tool).
  - **Paid/purchase sources:** only flag them to Andrew if they're
    *significantly* better than what's grabbable free / from YouTube.
  - **Pixabay / freesound logins:** Andrew can provide on request — either via a
    Claude-in-Chrome tab or a throwaway login to use-and-discard.
  - **Disk watch:** C: is 98% full (~54 GB free); `raw-sounds/` is inside the
    Google-Drive-synced tree, so large grabs there sync up to Drive. Option to
    stage bulk downloads in a non-synced sibling folder instead.
  - **yt-dlp DOES NOT need slow/overnight handling — DON'T use
    `--download-sections` for quick tests, that's what caused the apparent
    throttle.** Full story in DECISIONS.md (2026-06-30, corrected same day):
    plain `-x`/`-f bestaudio` whole-file downloads hit full CDN speed
    (5-46 MiB/s) with zero special setup; `--download-sections` (used to keep
    *test* grabs short) forces an ffmpeg-piped sequential GET that googlevideo
    paces to ~2x realtime — that's what looked like a hard throttle and burned
    real debugging time. The `web`/`mweb`/`tv` clients ARE still genuinely
    blocked (SABR streaming, no downloadable URL) — use the default
    (`android_vr`) client for whole-file grabs. Leftover-but-harmless tooling
    from the false trail: **Deno 2.9.0** at `C:\Users\andre\deno\deno.exe`,
    **bgutil POT provider** at `C:\Users\andre\bgutil-prov\server`
    (`node build/main.js`, port 4416), yt-dlp on **nightly**. Not needed for
    normal grabs but harmless to leave installed.

## 0b. DECIDED + IMPLEMENTED — ship scene audio as Opus, not MP3 (2026-06-30, done 2026-07-01)
Evidence-based call (DECISIONS.md 2026-06-30 entry; A/B in
`raw-sounds/_yt-test/ab/`): MP3@128k brick-walls noise at ~16 kHz; Opus@128k
(smaller) holds to ~20 kHz and degrades noise gracefully. Container/extension
settled: plain `.opus` (Ogg-Opus), sample rate **48kHz** (libopus rejects
44.1kHz — the pipeline's old assumption — outright).
**Implementation done 2026-07-01:** `tools/loopify-scenes.py` emits Opus and
self-migrates a scene's JSON + sidecar when it converts a file;
`HowlScene.ts`'s Howler format list + the hardcoded bed URLs are `.opus`; the
3 synth beds are regenerated and verified; `sceneCatalogue.test.ts` accepts
both extensions during the scene-by-scene migration; CLAUDE.md rule #3 +
file-layout updated. 254/254 tests pass, typecheck clean.
**Loop-cut of the new source material: DONE 2026-07-02** (`ae3c357`, see 0a) —
28 Opus cuts live in `public/audio/`, pending Andrew's ear audition.
**Meditations/stories (voice) — DECIDED to stay MP3/WAV, not just deferred**
(DECISIONS.md 2026-07-01): Opus's advantage is specifically for broadband
noise; voice has no content above ~8kHz where MP3 already loses nothing
audible. No regeneration needed or planned. One indirect touchpoint: once
singing-bowl (the meditation bed) is rebuilt, its bed layer will be Opus
automatically via the same scene pipeline — the narration track is unaffected.
iOS still deferred; verify Opus-in-`<audio>` on target Safari before it ships.

## 0c. Story background "suddenly loud" bug — fixed, not fully confirmed (2026-07-01)
Andrew reported a generated story's background scene jumping suddenly loud
partway through playback (~2min mark / "48%" on-screen, most likely the
Background-slider readout). Investigated by code reading (no device this
session); traced Night Drift (40min, not 2min — ruled out), the
`bedAttenuation` mount-time race (traced through, no bug found), SW
keep-alive + wake-lock (don't touch volume — ruled out). Found and fixed one
concrete, verifiable defect: `HowlLayer.onplay` (`src/audio/howl/HowlScene.ts`)
re-ran the from-silence fade on **every** `'play'` event, not just the first —
a spurious replay (OS audio-focus interruption resume, Howler's pooled
html5-element reuse) would silently drop the layer to 0 and swell it back up
over 5s, audible as "background suddenly got loud" once the swell completes.
Fixed with a `hasFadedIn` guard; regression test added; DECISIONS.md entry
records the reasoning and flags this as **not fully closed** — no device
confirmation this was THE cause. An OS-level audio-focus ducking/release is
a plausible secondary/alternate cause outside this codebase's control. Watch
for recurrence.

## 0d. Freesound login needed for one fireplace candidate
`Christopher Courter "Crackling Fireplace"` (CC0, 6:43, clean single-burn
take — good loop-pipeline fit) needs a Freesound account login to download
at full quality. Andrew offered to provide a login (Claude-in-Chrome tab or
throwaway use-and-discard) on request — ask if this file is wanted.

## 0. Scene-audio re-cut batch — SUPERSEDED 2026-06-30 (kept only for the per-layer quality notes; see 0a)
Andrew listened through all 44 shipped scene layers in the audio-scope
dashboard and flagged 15. **Full per-file plan: `notes/scene-audio-flags-2026-06-21.md`.**
Sources are in the gitignored `raw-sounds/` dump (610 files).
- **DECIDED:** rebuild the whole **singing-bowl** scene from the 11 real bowl
  recordings in the dump (the audiocraft MusicGen bed was rejected outright).
- The rest: RECUT clean regions avoiding the flagged artifacts (forest creek-2,
  wind-1, forest-evening wind-1, birds-2, forest-rain forest-1); REPLACE two
  scrapped winds (forest wind-2, forest-evening wind-2) from the dump; LEVEL
  three dynamics fixes (ocean wave-1/wave-2, fireplace close-3).

### PROGRESS — LEVEL slice already BUILT, pending audition (reconciled 2026-06-30)
The 6/16 hand-off was written *before* this batch was touched and never
updated, so it under-reports. After the 18:02 hand-off commit on 2026-06-21, a
session went on (18:26–18:31) and **built the entire LEVEL slice** — but never
recorded it. State on disk (all in gitignored `raw-sounds/_candidates/scene-audio-2026-06-21/`):
- **3 finished LEVEL candidates, verified at exactly 251.000s** (the ocean/
  fireplace prime offset): `wave-1.cand.mp3` (level-drift fix), `wave-2.cand.mp3`
  (volume match), `close-3.cand.mp3` (volume-disconnect fix). `*.level.mp3` are
  the pre-loop intermediates.
- **`AB/`** holds OLD-vs-NEW pairs and **`scope/`** is a pre-generated
  audio-scope dashboard — ready to open and audition.
- Built by **`tools/_build-level-candidates.sh`** (untracked, top of repo,
  marked "TEMP / not for commit"; dynaudnorm long-window leveling → loudnorm →
  seamless 251s wrap). Nothing is committed; nothing is lost — it's all intact
  in the gitignored dump.
- **NEXT for this slice:** audition the 3 candidates → if they pass, promote into
  `public/audio/`, run `sceneCatalogue.test.ts`, bump `CACHE_VERSION`, commit.
- **NOT started:** the RECUT (5), REPLACE (2), and singing-bowl REBUILD work —
  only the LEVEL slice exists so far.

- **Workflow is a loop:** produce candidates → Andrew auditions in the dashboard
  → confirm/re-flag (he caught these by ear; spectrograms alone won't verify).
- Pipeline: `tools/transcode-scene-audio.sh` + `tools/loopify-scenes.py`; keep
  each file on its element's prime offset. After re-renders: re-run
  `sceneCatalogue.test.ts` and bump `CACHE_VERSION` in `public/sw.js`.
- Audition dashboard to re-serve: `python -m http.server` rooted at the sibling
  `SleepApp-audio-review/` + `tailscale serve` (was at
  https://crane-desk.saiga-wage.ts.net/scope/dashboard.html). The local server
  dies with the session — restart it next time.

## 1. Synthesize the expanded meditation catalogue (ACTION — needs your key)

Scripts for all 10 meditations are written and committed (`a0decb7`). The
audio is not generated yet. Set `ELEVEN_LABS_API_KEY`, then run these from the
repo root (needs `npx tsx`). The tool writes each MP3, loudness-normalizes it,
and updates `public/meditations/index.json`.

Re-render the existing 3 (metadata preserved; `--voice` MUST match original):
```
npx tsx tools/gen-meditation.ts --id body-scan-01 --voice hush  --script public/meditations/body-scan-01.txt
npx tsx tools/gen-meditation.ts --id breath-01    --voice ember --script public/meditations/breath-01.txt
npx tsx tools/gen-meditation.ts --id forest-01    --voice glen  --script public/meditations/forest-01.txt
```

Generate the 7 new ones:
```
npx tsx tools/gen-meditation.ts --id tense-and-release  --title "Tense and release"  --style body-scan     --voice hush  --script public/meditations/tense-and-release.txt  --description "Each muscle pulls gently tight for a breath, then lets go all at once, until the body forgets how to hold on."
npx tsx tools/gen-meditation.ts --id lake-at-dusk       --title "The lake at dusk"    --style visualization --voice ember --script public/meditations/lake-at-dusk.txt       --description "A mirror-still lake as the last light leaves it, the mist settling, the water holding everything quiet."
npx tsx tools/gen-meditation.ts --id warm-room          --title "The warm room"       --style visualization --voice glen  --script public/meditations/warm-room.txt          --description "A low fire, a heavy blanket, the dark soft against the windows — and you, the last one awake, with nothing left to tend."
npx tsx tools/gen-meditation.ts --id long-exhale        --title "The long exhale"     --style breath-focus  --voice hush  --script public/meditations/long-exhale.txt        --description "The out-breath stretches longer than the in, again and again, until letting go is the only thing left to do."
npx tsx tools/gen-meditation.ts --id down-the-staircase --title "Down the staircase"  --style visualization --voice ember --script public/meditations/down-the-staircase.txt --description "A wide, soft staircase into the warm dark, one slow step down with every breath, until there is nowhere lower to go."
npx tsx tools/gen-meditation.ts --id quiet-shuffle      --title "The quiet shuffle"   --style visualization --voice glen  --script public/meditations/quiet-shuffle.txt      --description "A slow drift of small, unrelated images with no thread to follow — the mind, given nothing to solve, finally lets go."
npx tsx tools/gen-meditation.ts --id under-a-slow-sky   --title "Under a slow sky"    --style visualization --voice hush  --script public/meditations/under-a-slow-sky.txt   --description "Lying back beneath a vast, turning night sky, the ground letting go, the body growing weightless among the stars."
```

After they're generated, ping me and I'll: bump `CACHE_VERSION` in
`public/sw.js` (the re-rendered 3 reuse filenames, so the cache-first SW would
otherwise serve stale audio), commit `public/meditations/`, and check off
roadmap 6.5.

## 2. Remaining v1.0 roadmap items (your input / hardware)
- **4.3 [ASK]** — replace 3 off-brief photos (singing-bowl Buddha statue,
  daylight forest-day, near-white monsoon). You source/pick; I optimize +
  tonal-grade + update NOTICES.md.
- **5.2 [DEVICE]** — device pass (PWA install, iOS Safari, overnight on the
  Howler engine), then bump `version` to `1.0.0`, tag, append DECISIONS.md.

## 3. Self-voice clone (when ready)
You're cloning your own voice in ElevenLabs to narrate these. Once you have
the voice ID, I'll add it to `VOICE_IDS` in `tools/gen-meditation.ts` and the
`VITE_VOICE_*` env so you can synthesize any meditation with `--voice <yours>`.

## 4. Cleanup chores (low priority, only on "deferred clean-up work")
- Worktree litter under `.git/worktrees/` + `.claude/worktrees/` (Drive holds
  handles — `prune`/`rm` fail with Permission denied; cosmetic).
- `git remote prune origin` (remote-tracking refs bloated); delete any stray
  `claude/*` branches that are 0 ahead of main.
- `rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3`
  (gitignored loudnorm backups, if present).

## 5. Overnight audio-seam bugs B1–B4 — PROBABLY MOOTED 2026-07-02, confirm at audition
The clean-source refresh (`ae3c357`) replaced forest-night wind and all
ocean-night waves wholesale (new sources, gapless fade-wrap loops), which
should moot B1/B3/B4 outright; B2's linear-vs-equal-power wrap concern applies
to the new `loopify-scenes.py` wrap too but hasn't been audible so far. Close
these after Andrew's audition of the new cuts passes. Original report kept
below for reference:
From the 2026-06-17 overnight listening session
(`notes/bug-reports-2026-06-17.md`). Loop-seam/level defects in shipped scenes
that need the **original source audio + your ears** — not fixable from the
in-repo trimmed MP3s:
- **B1** Forest Night "wind in leaves" has an incongruous car/plane sound —
  pick A→B loop points that exclude it.
- **B2** Loop wrap uses a LINEAR crossfade; should be EQUAL-POWER. Specced and
  ready to apply to `tools/loopify-scenes.py` once sources are available.
- **B3** Choose mid-clip A→B loop points that are sonically similar (makes B2's
  crossfade inaudible and routes around B1).
- **B4** Ocean Night: sharp cutoff at the loop end on the swelling wave — land
  the seam in a quiet trough (B3) + equal-power wrap (B2).
Branch `claude/forest-night-audio-crossfade-f5w5ws` exists for this (no open
PR). B5 is done; B6/B7 mitigations shipped — **B7 is a possible-data-loss watch
item** (a generated story vanished overnight).

---
**Superseded (pre-pivot, 2026-06-06 list):** the old "device-test the bed/story
items" and "residual wake-lock gap in ContentPlayerScreen" decisions were tied
to the Web Audio overnight path that the Howler pivot replaced. Overnight
survival is now confirmed (6h, PR #13); session-owned protections were
rewritten in `HowlScenePlayer`. Any remaining device validation is folded into
roadmap 5.2. See DECISIONS.md for the pivot record.
