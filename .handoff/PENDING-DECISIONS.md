# Pending decisions / queued actions

**What is open, and who it is waiting on.** Rewritten clean at v1.0.0
(2026-10-01). Everything closed before then, with its reasoning, is in
`DECISIONS.md`, or in this directory as it stood at tag `v1.0.0`
(`git show v1.0.0:.handoff/PENDING-DECISIONS.md`).

**Nothing blocks anything.** v1.0.0 is tagged and live. Every item below is
optional.

## Buildable without Andrew

- **A second variant for `waterfall-valley/falls-main`.** It ships one, and
  every other element has 2-5 for `variantRotation`. Its FTUS master
  (`~/sounds/normalized/waterfall-valley__falls-main__falls-1.wav`, 520 s)
  may hold a second clean 409 s window. Otherwise it needs a new source; see
  the source packs below.
- **C6: a whole-night soak watching for spectrum discontinuities.** Specified
  in May and never run as such. Mostly covered since: `tools/seam-review.py`
  checks every wrap in the scene mix, `loopify-scenes.py --audit` shows no
  holes and no steps over 3 dB, and Andrew's overnights are clean.

## Waiting on Andrew, when he wants it

- **His own voice for narration.** Clone it in ElevenLabs, then add the voice
  ID to `VOICE_IDS` in `tools/gen-meditation.ts` (and the story tool) and
  re-render with `--voice`. The reading passage is
  `git show v1.0.0:notes/voice-clone-read-2026-09-19.md`. Cloning a real
  voice is allowed only because the app is private.
- **An apartment-rain scene.** Two candidate beds are extracted in
  `~/sounds/ftus/picked-2026-09-30/` (Singapore, apartment at night; rain on a
  metal roof; both 300 s, both with some thunder). They need a listen first.
- **Reserve photos,** unused but on-brief: the dark beach with a lighthouse
  glint (`IMG_1568`), night leaves (`L1010043`), and the second AI train
  (corridor). Originals are in `~/Taildrop/`, working copies in
  `~/incoming/photos-2026-09-30/`.

## Kept on purpose (do not clean up)

- **FTUS source packs** in `~/Downloads/remote-browser/`: the Immersive
  bundle's `ORTF3D_RAIN_01` and the All In One bundle's `RAIN_08` (glass) and
  `RAIN_11` (interior). The bundle's metadata map, which says which zip holds
  what, is unpacked at `~/sounds/ftus/aiob-meta/`. Andrew: "always have to
  watch for more need for scenes." `~/remote-browser.sh start` reopens a
  Gumroad browser on tikiserv for more.
