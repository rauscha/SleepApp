# Overnight log — 2026-08-18 → 19

Task, in your words: *"keep working on the audio, make it perfectly beautifully
relaxing loops and amazing stories, and then push them to the app so i can
download from andrewrausch.com and use it to sleep tonight."*

---

## Done overnight

### 1. All 20 FTUS sounds pulled out of 137 GB of ZIPs

The 20 picks from the purchased Free To Use Sounds bundle are extracted,
verified, and now shipped. Along the way the ZIP mapping in the pull list
turned out to be wrong in one place, and the correction is committed.

The pull list predicted which Gumroad ZIP held each file using a
cumulative-size model. That model put the three "Mossy Rock Cascade" waterfall
files in `WATER_01` and said `WATER_06` was *not needed*. In fact the WATER
library is split by **category**, alphabetically: `WATER_01–02` are FLOW,
`WATER_03–05` are SURF, and `WATER_06` is TURBULENCE + WATERFALL. Nothing
named `WATRFall` exists in any other WATER ZIP. You downloaded WATER_06 and
the three files came out of it. The lesson is written into the note: **match
by filename category prefix, not by cumulative size.**

Every file was checked with `ffprobe`: all 8-channel / 96 kHz / 32-bit float,
and every duration matches its RecID in the selection note to the second.

**Wind and windows, which you asked me to check:** `WIND_01` was downloaded,
indexed, and rejected — but not for the reason you'd assume. Its `VEGETATION`
category is exactly the right material (forest treetops, wind through giant
trees). The problem is **length**: the longest is 308 s, and every wind element
in the app sits at 409 (needs ≥415 s) or 521 (needs ≥527 s). So the selection
note's "no fit" verdict holds for a *duration* reason, not a quality one. There
is an unlock available if you want it later — re-keying a wind element to 199
or 251 the way `night-ambience` was re-keyed — but wind gusts and the "wood
creaking" transients in those recordings are far more distinctive than a
cricket chorus and would likely metronome at a 3–4 minute loop. `WINDOWS_01`
is not window weather at all; it's motorised hotel-curtain foley, 25–39 s
clips. Nothing usable.

### 2. Found and fixed a loop defect affecting every file we have ever cut

This is the significant one, and it is exactly the thing you were worried
about when you said *"don't want end of clip to crash up into start of another
clip."*

`loopify-scenes.py` trims a source starting at t = 0, so the first six seconds
of the file become the loop's wrap head. Raw field recordings almost always
open with a fade-in or the recordist settling in. Measuring the first six
seconds against the six seconds at the loop point, across all 20 sources,
showed **level steps of 10–17 dB on most files**:

| file | step at t=0 |
|---|---|
| forest-evening / forest-rain | 17.5 dB |
| ocean-night / dockside-distant | 15.3 dB |
| monsoon / rain-4 | 13.8 dB |
| waterfall / cascade-close | 14.0 dB |
| forest-day / creek-4 | 13.5 dB |

That step fires at *every* wrap — every 251 seconds, all night. It is almost
certainly the same phenomenon behind the old "story background suddenly got
loud" report (PENDING 0c), which was investigated in July and never fully
closed.

Compression cannot fix this, and trying would ruin the material. The fix is to
**start the loop somewhere else**. For each file a 1 kHz mono loudness envelope
is computed once, then a start offset S is searched over the whole usable range
to minimise the difference between the level at S and at S+P, while penalising
any candidate whose wrap regions sit more than 4 dB off the file's own average
(so the seam doesn't land somewhere unrepresentative of the recording).

Result — **16 of 20 files now wrap with a 0.0–0.5 dB step.** Two residuals:
`night-4` at 5.0 dB and `rain-pavement` at 4.3 dB, both sources with very
little slack to search in. Flagged for your ears.

### 3. Levels normalised per element, not globally

Measuring the 47 already-shipped variants first turned up something worth
knowing: **the catalogue was never uniformly normalised.** Integrated loudness
ranges from −18.9 to −26.1 LUFS, and per-element medians span −19.8 (forest-
evening birds) to −25.8 (singing-bowl shimmer). A single global target would
have wrecked the existing mix balance.

So each new file is normalised to **its destination element's measured median**,
which means it drops in against an unchanged `defaultVolume` and the mix
voicing from the brief still holds.

Chain per file: front ORTF pair only (`pan=stereo|c0=c0|c1=c1` — never a
generic `-ac 2`, which folds the rear and height capsules in and mushes the
stereo image) → `dynaudnorm` at a ~40 s window for slow drift → **two-pass**
`loudnorm` in linear mode. Two-pass matters: single-pass runs loudnorm's
dynamic mode, which gates and pumps on a six-minute noise bed.

Worth recording: **`dynaudnorm` barely moved LRA** (e.g. 10.3 → 10.2). That is
correct, not a failure — for this material the variation *is* the content
(waves swelling over ~10 s). It also means LRA was the wrong thing to chase;
the seam match is what mattered.

### 4. Wired into the app and shipped

- **Added alongside** the existing variants in ocean-night, forest-day,
  forest-evening, rain-on-window and monsoon, per your call — so you can A/B
  old against new over several nights before retiring anything.
- **forest-night `night-ambience` re-keyed 409 → 199** with the three new
  cricket beds replacing the old two, per your call.
- forest-night keeps sharing forest-day's creek files; the two new creeks are
  shared the same way.
- `loopify-scenes.py` trimmed all 20 to their exact primes and converted to
  Opus. `CACHE_VERSION` bumped v9 → v11.

### 5. Two new stories, narrated by Glen

`observatory.mp3` (19m07s) and `temple-stairs.mp3` (19m17s), written to the
house prompt contract — second person, orient → settle → drift, `[pause]` and
`[softly]` markers every few sentences, no stakes, trailing off mid-thought at
the end because you're meant to be asleep before it finishes.

**Glen, not Stone.** `notes/voice-design.md` catalogues Glen as one of the
three *story* voices — deep baritone, ~115–125 wpm, explicitly "the one for
users who find female narration distracting at sleep onset", best for outdoor
and weather-aware narratives. It had only ever been wired into
`gen-meditation.ts`, so the story CLI's one male option was Stone, which the
same document describes as a *meditation* voice. Glen is now exposed in
`gen-story.ts`.

Observatory pairs with forest-night, temple-stairs with forest-evening.

**Also fixed:** `durationSeconds` in the story index was a word-count estimate
(`words / 130 × 60`) and over by ~10% on every entry — the Library was showing
seaside-village as 1259 s when the audio is 1137 s. All four are now measured.

### Commits (all pushed to `origin/main`)

| | |
|---|---|
| `023de8e` | Correct the FTUS ZIP mapping and record the completed WAV pull |
| `da8c0c3` | Expose Glen as a story narrator in gen-story.ts |
| `0ea728c` | Add two sleep story scripts: the observatory and the temple stairs |
| `a02162f` | Land 20 FTUS scene variants, seam-matched and leveled |
| `92032bc` | Add two Glen-narrated sleep stories and correct story durations |

`npx tsc --noEmit` clean and `npx vitest run` 259/259 green at every commit.

---

## Waiting on you

### A. What did you mean by "source from things ki…"?

Your answer to the waterfall-valley question came through cut off mid-word, so
I did not guess.

**Where it stands:** the scene's four audio files are fully processed, leveled,
seam-matched and sitting in `public/audio/waterfall-valley/`. The scene JSON is
written and staged at `notes/staged/waterfall-valley.scene.json`. It is **not**
shipped, because `sceneCatalogue.test.ts` requires `public/scenes/` to match
`index.json` exactly — there is no "hidden scene" state in this codebase — and
the scene still needs 3 Midnight-Editorial photos.

**To finish it:** tell me where the photos come from and I'll wire the scene,
the index entry and the photos in one pass. It is maybe twenty minutes of work
once the images exist.

### B. waterfall-valley's third element

You spent `#726` (the wild salmon river) on forest-evening's 691 slot. I
checked every FLOW / WATERFALL / TURBULENCE file across all 16 ZIPs: **`#726`
is the only one in the entire bundle ≥527 s**, so waterfall-valley's
`river-below` @521 has no possible source from this bundle.

Options: ship it as a 2-element scene (cascade-close @251 ×3 + falls-main
@409 — legal under the ≥2-element rule but short of the "ideally 3–4"), or add
a third layer at **199** from the WATER_06 leftovers. Best candidates there are
a 260 s "Lush Forest, Water Running Over Rocks, Small Creek" and a 294 s "Front
and Rear Flow". Caveat: three water layers risks spectral mush, so it wants an
ear.

### C. Two files to listen to specifically

Everything is worth auditioning, but two have known residual risk:

- **`forest-night/night-ambience/night-4`** (`#233`) — the worst remaining seam
  at 5.0 dB, *and* the widest source in the batch at LRA 15.2. It has crow caws
  in it. At a 199 s loop a distinctive caw becomes a metronome every 3m19s.
  `night-5` (`#234`) has the same caveat. `night-3` (`#612`, the pure chorus)
  is the safe anchor and wraps at 1.2 dB.
- **`rain-on-window/rain-pavement/pavement-3`** (`#656`) — 4.3 dB residual;
  wind-driven rain with gusts, and not much slack to move the loop point.

If either bothers you, say so and I'll re-cut from a different region of the
same source — both have plenty of unused material.

### D. Small follow-ups I did not take on

- **`gen-story.ts` duration estimator** still computes `words / 130 × 60`. I
  corrected the committed values but not the tool, because fixing it properly
  means giving it an ffprobe dependency. Worth doing before the next story.
- **The ElevenLabs Projects API returned 405** for both renders and fell back
  to chunked TTS. The fallback works and the output is good, but Projects is
  the documented preferred long-form path, so it may have moved or be gone on
  your plan tier. Worth a look before a longer piece.
- **`tools/_build-level-candidates.sh`** is still untracked. The 2026-08-09
  hand-off called it safe to delete because "its logic already lives in
  `tools/loopify-scenes.py`" — **that is not true.** loopify does no levelling
  at all (it says so explicitly: "no loudnorm on scene files"). That script is
  the only record of the dynaudnorm → loudnorm recipe, which I used tonight.
  I left it alone rather than commit a file marked "not for commit", but it
  should not be deleted.
