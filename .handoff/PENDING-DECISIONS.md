# Pending decisions / queued actions

Refreshed 2026-06-21. Older pre-pivot items have been resolved or folded into
the Howler pivot and the v1.1 roadmap — see the note at the bottom.

## 0. Scene-audio re-cut batch — TOP of the next session (2026-06-21)
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

## 5. Overnight audio-seam bugs B1–B4 (blocked on your source audio)
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
