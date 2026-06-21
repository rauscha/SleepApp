# Scene audio — artifact flags (2026-06-21 listening pass)

Andrew scrubbed all 44 shipped scene layers via the audio-scope dashboard and
flagged the below. Sources are available in the gitignored `raw-sounds/` dump
(610 files) + the freetousesounds library, so these are fixable. The
singing-bowl bed is locally-generated audiocraft and was rejected outright.

**Fix legend:** RECUT = cut a clean region of the SAME source to the element's
prime length, avoiding the timestamped artifact · REPLACE = source unusable,
pick a fresh source from the dump · LEVEL = volume/dynamics (dynaudnorm or
re-cut a level-consistent region) · REBUILD = whole-scene redo. Every re-cut
goes through `transcode-scene-audio.sh` + `loopify-scenes.py`, must land on the
element's prime offset, and **needs an ear-audition pass** (these were caught by
listening, not spectrogram).

## Forest (forest-day; creek + wind are shared with forest-night)
- creek-trickle / creek-2 (251s) — RECUT. car :49–:58; wind-in-mic 3:45–4:00.
- wind-in-leaves / wind-1 (521s) — RECUT. cars 6:25–6:33 & 7:59–8:11; clean end at the natural lull ~8:29.
- wind-in-leaves / wind-2 (521s) — REPLACE (scrap). artifacts scattered throughout; user-provided Wind-in-trees-2.wav unusable → fresh wind source.
- distant-birds / birds-2 (409s) — RECUT/REPLACE. car from 5:42→end; clean material ends ~4:27 (under 409) → re-cut a clean 409s region or drop element to birds-1 only.

## Forest-evening
- forest-rain / forest-1 (251s) — REPLACE/RECUT. too many (daytime) birds for an evening scene; two halves are different base layers (bad acrossfade) → single consistent, bird-light rain region.
- wind-in-leaves / wind-1 (409s) — RECUT. car 6:28–6:35.
- wind-in-leaves / wind-2 (409s) — REPLACE (scrap). cars, crickets, skipping audio.

## Ocean-night
- waves / wave-1 (251s) — LEVEL. good sound, big level drift start→finish.
- waves / wave-2 (251s) — LEVEL. needs volume normalization.

## Fireplace
- fire-close / close-3 (251s) — LEVEL. huge volume disconnect.

## Singing-bowl — WHOLE SCENE REJECTED (audiocraft MusicGen bed failed)
All five layers bad; the locally-generated bed doesn't work:
- bowl-drone / drone-1 (251s) — "screeching teapot"
- bowl-drone / drone-2 (251s) — "industrial ghost music"
- bowl-drone / drone-3 (251s) — "ghost music"
- bowl-shimmer / shimmer-1 (409s) — wrong character (asian flutes/pipes)
- bowl-shimmer / shimmer-2 (409s) — old-school mp3 warble
→ REBUILD from the 11 real singing-bowl recordings in the dump (decision pending),
or cut the scene. NB: singing-bowl is the meditation sound-bath bed.

## Structural knock-ons
- Scrapped variants (forest wind-2, forest-evening wind-2) need fresh
  replacements so each element keeps ≥1 (ideally 2) good variants for rotation.
- birds-2 may drop the element to birds-1 only unless a clean 409s region exists.
- After any re-render: re-run `sceneCatalogue.test.ts` (prime-length contract)
  and bump `CACHE_VERSION` in `public/sw.js`.
