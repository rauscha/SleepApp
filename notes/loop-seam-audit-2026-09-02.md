# Loop-seam audit — every shipped scene variant (2026-09-02)

Read-only measurement pass. Nothing under `public/audio/` was touched; no file
was re-cut. Reproduce with:

```
python tools/loopify-scenes.py --audit
```

## What is measured

Every shipped variant is already exactly its element's prime
`loopOffsetSeconds` (P) long, with the gapless wrap baked into `[0, C]`
(C = 6 s). So the step a sleeper hears at the loop point is the level of the
last 6 s `[P-6, P]` against the 6 s just past the wrap `[C, C+6]` — what plays
immediately before and immediately after the loop turns over. Levels are
per-second RMS in dBFS (ffmpeg `astats`), averaged over each 6 s window.

Also reported per file: its own mean level, and how far each wrap window
deviates from that mean (a matched pair sitting 10 dB below the body of the
file is its own kind of wrong).

The audit walks the scene JSONs exactly as `loopify_scenes()` does — every
element of every `public/scenes/*.json` except `index.json` — de-duplicating
files shared between scenes. 61 distinct variant files.

**Threshold: 3 dB.** 16 of 61 are over it.

## Why this exists

Until 2026-09-02 `loopify-scenes.py` always trimmed from t=0, so the wrap was
built from the source's first 6 seconds — which on a raw field recording is
usually a fade-in or the recordist settling. The loop is continuous there (the
crossfade guarantees no click) but the *level* steps, every P seconds, all
night. The tool now searches the start offset instead; see DECISIONS.md
"Search the loop start offset, don't trim from zero". This audit is the
baseline for the shipped files that predate that fix.

## Flagged files — is there a re-cuttable source?

Ordered worst-first. "Slack" is source duration − P − C: how much room a
re-cut search would have to find a level-matched seam.

| variant | step dB | P | source on this machine | duration | slack | re-cut? |
|---|---:|---:|---|---:|---:|---|
| singing-bowl/bowl-shimmer/shimmer-2 | 19.01 | 409 | MusicGen stems `raw-sounds/singing-bowl-gen/bowl-shimmer-{1,2}.wav` | 75 s each | n/a | only by re-stitching |
| singing-bowl/bowl-drone/drone-2 | 17.08 | 251 | MusicGen stems `raw-sounds/singing-bowl-gen/bowl-drone-{1,2,3}.wav` | 75 s each | n/a | only by re-stitching |
| singing-bowl/bowl-shimmer/shimmer-1 | 10.08 | 409 | as above | 75 s each | n/a | only by re-stitching |
| forest-night/night-ambience/night-5 | 9.90 | 199 | `D:\Sounds\normalized\forest-night__night-ambience__night-5.wav` (= FTUS picked master, front ORTF pair) | 219.3 s | 14.3 s | yes |
| forest-evening/wind-in-leaves/wind-1 | 9.80 | 409 | `raw-sounds/_sources/george-vlad/wind-element__soft-wind-and-snow__iH4zn2-FWxA.opus` | 5011.8 s | 4596.8 s | yes, ample |
| ocean-night/waves/wave-3 | 8.43 | 251 | `raw-sounds/_sources/george-vlad-ocean/ocean-night__rocky-beach-masoala__SNgELhR1v2k.opus` | 3794.0 s | 3537.0 s | yes, ample |
| ocean-night/waves-far/far-1 | 7.82 | 409 | same Masoala master (shipped variant is that master + 2.8 kHz lowpass) | 3794.0 s | 3379.0 s | yes, ample |
| singing-bowl/bowl-drone/drone-3 | 7.08 | 251 | MusicGen stems as above | 75 s each | n/a | only by re-stitching |
| ocean-night/waves/wave-4 | 6.94 | 251 | `D:\Sounds\normalized\ocean-night__waves__wave-4.wav` (= FTUS `WATRSurf-…Tasmania, 03.wav`) | 364.7 s | 107.7 s | yes |
| rain-on-window/rain-pavement/pavement-3 | 6.29 | 521 | `D:\Sounds\normalized\rain-on-window__rain-pavement__pavement-3.wav` (= FTUS `RAINMetl-…Geelong, 13.WAV`) | 634.7 s | 107.7 s | yes |
| forest-evening/forest-rain/forest-2 | 4.62 | 251 | `raw-sounds/_sources/george-vlad/forest-day__rainy-morning-cloud-forest__etNCIPGSWaA.opus` | 5443.9 s | 5186.9 s | yes, ample |
| forest-night/night-ambience/night-4 | 3.92 | 199 | `D:\Sounds\normalized\forest-night__night-ambience__night-4.wav` (= FTUS `AMBGras-…Tasmania, 01.wav`) | 226.3 s | 21.3 s | yes (tight — tilt will carry it) |
| rain-on-window/distant-thunder-rumble/rumble-2 | 3.82 | 251 | `raw-sounds/freesound_community-thunder-48580.mp3` (Pixabay, named in the sidecar) | 626.5 s | 369.5 s | yes |
| forest-evening/distant-birds/birds-2 | 3.75 | 521 | `raw-sounds/_sources/george-vlad/forest-evening__wind-and-birdsong-japan__9BC4gUUoMXc.opus` | 4207.6 s | 3680.6 s | yes, ample |
| ocean-night/waves-far/far-2 | 3.75 | 409 | `raw-sounds/_sources/george-vlad-ocean/ocean-night__sandy-beach-madagascar__i7ds-DhM89I.opus` | 3857.7 s | 3442.7 s | yes, ample |
| forest-evening/wind-in-leaves/wind-2 | 3.52 | 409 | `raw-sounds/_sources/george-vlad/wind-element__namib-desert-wind__mB6ATIwmEAQ.opus` | 3640.0 s | 3225.0 s | yes, ample |

Notes on the sources:

- **12 of 16 have a longer source on disk and can be re-cut today.** Seven of
  those come from six George Vlad masters, whole-hour YouTube releases, so
  their re-cut has effectively unlimited slack; each sidecar records which
  second of the master the current variant came from (`cut @NNNNs`), so the
  same character can be kept while moving the seam.
- The four FTUS variants re-cut from `D:\Sounds\normalized\*.wav`, the leveled
  pre-trim masters (identical to the `D:\Sounds\picked` bundle files after the
  front-ORTF-pair extraction and `dynaudnorm` leveling). Note
  `D:\Sounds\final\<scene>\<element>\*.wav` are the *already trimmed* loops —
  only ~2 s of slack — so re-cut from `normalized`, not `final`.
- **The four singing-bowl files are the exception.** They are not field
  recordings but 5- and 7-segment stitches of 75 s locally generated MusicGen
  stems (`raw-sounds/singing-bowl-gen/`); the stitched intermediate is not on
  disk, so a re-cut means re-running the stitch. Worth noting they are also the
  worst offenders in the catalogue by a wide margin, and that DECISIONS.md
  (2026-07-01) already demoted singing bowls to an optional texture and
  rejected MusicGen for the meditation bed — so the likely resolution here is
  "replaced", not "re-cut".

## Sparse event layers read as 0.00 dB — that is correct

Four files sit at the bottom of the table with an exact 0.00 dB step and a mean
level of −84 to −109 dBFS: `monsoon/thunder-rumble/rumble-{1,2}` and
`ocean-night/dockside-distant/dock-{1,2}`. These are the deliberately sparse
"event" layers the scene rules call for — mostly digital silence with
occasional hits (rumble-1: 75 of 521 seconds non-silent, peaking at −13 dBFS).
Both wrap windows are silence, so the step is genuinely zero. Their large
negative deviation from the file mean is an artifact of averaging silence, not
a defect.

## Full table (worst first)

Columns: **step dB** = the wrap step; **mean dB** = the file's own mean level;
**tail dev** / **post-wrap dev** = how far each wrap window sits from that mean.

| # | scene | element | variant | P | step dB | mean dB | tail dev | post-wrap dev | flag |
|---:|---|---|---|---:|---:|---:|---:|---:|---|
| 1 | singing-bowl | bowl-shimmer | shimmer-2.opus | 409 | 19.01 | -31.3 | +4.2 | -14.8 | **FLAG** |
| 2 | singing-bowl | bowl-drone | drone-2.opus | 251 | 17.08 | -31.5 | +13.7 | -3.4 | **FLAG** |
| 3 | singing-bowl | bowl-shimmer | shimmer-1.opus | 409 | 10.08 | -31.2 | +7.1 | -3.0 | **FLAG** |
| 4 | forest-night | night-ambience | night-5.opus | 199 | 9.90 | -25.1 | -9.4 | +0.5 | **FLAG** |
| 5 | forest-evening | wind-in-leaves | wind-1.opus | 409 | 9.80 | -24.5 | -2.1 | -11.9 | **FLAG** |
| 6 | ocean-night | waves | wave-3.opus | 251 | 8.43 | -25.1 | -3.8 | +4.6 | **FLAG** |
| 7 | ocean-night | waves-far | far-1.opus | 409 | 7.82 | -22.6 | -5.6 | +2.2 | **FLAG** |
| 8 | singing-bowl | bowl-drone | drone-3.opus | 251 | 7.08 | -31.2 | +5.3 | +12.3 | **FLAG** |
| 9 | ocean-night | waves | wave-4.opus | 251 | 6.94 | -26.3 | +2.2 | -4.7 | **FLAG** |
| 10 | rain-on-window | rain-pavement | pavement-3.opus | 521 | 6.29 | -28.5 | -5.7 | +0.6 | **FLAG** |
| 11 | forest-evening | forest-rain | forest-2.opus | 251 | 4.62 | -26.2 | -3.4 | +1.2 | **FLAG** |
| 12 | forest-night | night-ambience | night-4.opus | 199 | 3.92 | -26.3 | -5.0 | -1.1 | **FLAG** |
| 13 | rain-on-window | distant-thunder-rumble | rumble-2.opus | 251 | 3.82 | -24.2 | -1.2 | +2.6 | **FLAG** |
| 14 | forest-evening | distant-birds | birds-2.opus | 521 | 3.75 | -24.9 | -2.2 | +1.6 | **FLAG** |
| 15 | ocean-night | waves-far | far-2.opus | 409 | 3.75 | -27.9 | +4.0 | +0.2 | **FLAG** |
| 16 | forest-evening | wind-in-leaves | wind-2.opus | 409 | 3.52 | -18.6 | +3.3 | -0.3 | **FLAG** |
| 17 | forest-day | distant-birds | birds-3.opus | 409 | 2.78 | -27.1 | -2.1 | +0.7 |  |
| 18 | ocean-night | waves | wave-1.opus | 251 | 2.41 | -28.7 | +1.9 | -0.5 |  |
| 19 | ocean-night | waves | wave-2.opus | 251 | 2.34 | -28.4 | -2.6 | -5.0 |  |
| 20 | rain-on-window | rain-on-glass | glass-2.opus | 409 | 2.18 | -26.1 | +5.4 | +3.3 |  |
| 21 | forest-day | distant-birds | birds-1.opus | 409 | 2.11 | -27.6 | -0.6 | +1.5 |  |
| 22 | rain-on-window | rain-on-glass | glass-1.opus | 409 | 1.99 | -25.0 | +1.8 | -0.2 |  |
| 23 | forest-evening | forest-rain | forest-3.opus | 251 | 1.87 | -22.2 | -3.9 | -2.0 |  |
| 24 | monsoon | rain | rain-4.opus | 251 | 1.81 | -25.2 | -3.6 | -5.4 |  |
| 25 | forest-evening | forest-rain | forest-1.opus | 251 | 1.77 | -27.1 | -0.6 | +1.2 |  |
| 26 | forest-evening | wind-in-leaves | wind-3.opus | 409 | 1.59 | -22.0 | -6.2 | -7.8 |  |
| 27 | forest-day | creek-trickle | creek-4.opus | 251 | 1.57 | -25.5 | +2.5 | +0.9 |  |
| 28 | rain-on-window | rain-pavement | pavement-2.opus | 521 | 1.49 | -28.6 | -0.4 | +1.0 |  |
| 29 | monsoon | rain | rain-1.opus | 251 | 1.48 | -26.5 | -0.6 | +0.9 |  |
| 30 | monsoon | rain | rain-5.opus | 251 | 1.37 | -24.1 | -1.6 | -3.0 |  |
| 31 | ocean-night | dockside-distant | dock-3.opus | 521 | 1.13 | -21.3 | -0.5 | +0.7 |  |
| 32 | forest-day | creek-trickle | creek-1.opus | 251 | 1.13 | -26.0 | -0.3 | +0.9 |  |
| 33 | monsoon | rain | rain-2.opus | 251 | 1.02 | -26.8 | -0.2 | +0.8 |  |
| 34 | rain-on-window | rain-on-glass | glass-3.opus | 409 | 1.02 | -27.6 | -0.3 | +0.7 |  |
| 35 | ocean-night | waves | wave-5.opus | 251 | 0.92 | -23.0 | +2.6 | +3.5 |  |
| 36 | forest-day | distant-birds | birds-2.opus | 409 | 0.86 | -27.9 | -1.1 | -1.9 |  |
| 37 | monsoon | rain-distant | distant-1.opus | 409 | 0.81 | -25.8 | -1.0 | -0.1 |  |
| 38 | forest-night | night-ambience | night-3.opus | 199 | 0.81 | -26.2 | -1.8 | -1.0 |  |
| 39 | forest-day | wind-in-leaves | wind-2.opus | 521 | 0.72 | -18.0 | +0.2 | +0.9 |  |
| 40 | fireplace | fire-distant | distant-1.opus | 409 | 0.67 | -18.1 | -0.1 | -0.8 |  |
| 41 | forest-evening | distant-birds | birds-1.opus | 521 | 0.63 | -25.8 | -2.8 | -2.2 |  |
| 42 | monsoon | rain | rain-3.opus | 251 | 0.56 | -27.2 | +1.4 | +0.8 |  |
| 43 | fireplace | fire-close | close-1.opus | 251 | 0.54 | -18.7 | +0.1 | +0.7 |  |
| 44 | forest-evening | creek-trickle | creek-2.opus | 691 | 0.50 | -23.2 | -0.1 | -0.6 |  |
| 45 | fireplace | fire-close | close-2.opus | 251 | 0.47 | -18.6 | +0.4 | -0.1 |  |
| 46 | singing-bowl | bowl-drone | drone-1.opus | 251 | 0.35 | -31.1 | +7.2 | +6.9 |  |
| 47 | fireplace | fire-distant | distant-2.opus | 409 | 0.32 | -18.2 | -0.0 | +0.3 |  |
| 48 | forest-evening | creek-trickle | creek-3.opus | 691 | 0.29 | -22.1 | -2.0 | -2.2 |  |
| 49 | forest-day | creek-trickle | creek-3.opus | 251 | 0.28 | -25.1 | +0.2 | +0.5 |  |
| 50 | rain-on-window | distant-thunder-rumble | rumble-1.opus | 251 | 0.19 | -24.3 | +0.5 | +0.7 |  |
| 51 | rain-on-window | rain-pavement | pavement-1.opus | 521 | 0.16 | -28.3 | +0.3 | +0.4 |  |
| 52 | fireplace | fire-close | close-3.opus | 251 | 0.16 | -18.8 | +0.2 | +0.3 |  |
| 53 | ocean-night | waves-far | far-3.opus | 409 | 0.15 | -21.5 | -3.6 | -3.4 |  |
| 54 | forest-evening | creek-trickle | creek-1.opus | 691 | 0.11 | -23.2 | -0.1 | -0.0 |  |
| 55 | forest-day | wind-in-leaves | wind-1.opus | 521 | 0.06 | -23.4 | -0.5 | -0.5 |  |
| 56 | monsoon | rain-distant | distant-2.opus | 409 | 0.04 | -25.4 | -0.0 | -0.1 |  |
| 57 | forest-day | creek-trickle | creek-2.opus | 251 | 0.03 | -25.9 | -0.2 | -0.3 |  |
| 58 | monsoon | thunder-rumble | rumble-2.opus | 521 | 0.00 | -109.0 | -11.0 | -11.0 |  |
| 59 | ocean-night | dockside-distant | dock-2.opus | 521 | 0.00 | -90.6 | -29.4 | -29.4 |  |
| 60 | ocean-night | dockside-distant | dock-1.opus | 521 | 0.00 | -84.5 | -35.5 | -35.5 |  |
| 61 | monsoon | thunder-rumble | rumble-1.opus | 521 | 0.00 | -107.1 | -12.9 | -12.9 |  |

16 of 61 variants over 3.0 dB.
