# Pending decisions / queued actions

Refreshed 2026-06-16. Older pre-pivot items have been resolved or folded into
the Howler pivot and the v1.1 roadmap — see the note at the bottom.

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

---
**Superseded (pre-pivot, 2026-06-06 list):** the old "device-test the bed/story
items" and "residual wake-lock gap in ContentPlayerScreen" decisions were tied
to the Web Audio overnight path that the Howler pivot replaced. Overnight
survival is now confirmed (6h, PR #13); session-owned protections were
rewritten in `HowlScenePlayer`. Any remaining device validation is folded into
roadmap 5.2. See DECISIONS.md for the pivot record.
