# FTUS bundle — WAV pull list (2026-08-18)

## HAND-OFF — pick up here on desktop (2026-08-19)

**State (updated 2026-08-18 ~22:20, desktop):** Sound selection done and
merged to main. 199 prime added to `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`
(tests 259/259 green). **Step 1 is COMPLETE**: 16 Gumroad ZIPs (~161 GB) are
in `D:\Sounds`, all indexed without extracting, and **all 20 picks are
extracted to `D:\Sounds\picked\`** (24 GB, outside the Drive-synced tree)
and validated — 8ch / 96 kHz / 32-bit float, every duration an exact match
for its RecID. WATER_06 was the one mapping miss and has been downloaded and
pulled; WIND_01 and WINDOWS_01 were checked and rejected (see "Categories
checked and REJECTED"). The `#726` and `#200` element homes are **decided**
(see "Element homes"). No audio has been processed yet; no scene JSON has
changed; the repo is otherwise untouched.

**Next steps, in order:**
1. ~~List each ZIP without extracting and pull the 20 picks.~~ **DONE** —
   see "VERIFIED MAPPING" below.
2. Per pick: extract the front ORTF pair (`pan=stereo|c0=c0|c1=c1`,
   48 kHz — NOT `-ac 2`), land the stereo WAV + license sidecar in
   `public/audio/<scene>/<element>/`, per the pipeline in
   `notes/personal-sounds-selection-2026-08-17.md`. Source files are in
   `D:\Sounds\picked\`. Call ffmpeg by full path — the WinGet `Links`
   shim is permission-denied under the bash tool.
3. Wire variants into the scene JSONs at the offsets below. Forest-night:
   re-key `night-ambience` 409 → 199 when its 3 cricket variants land.
   The `#726` / `#200` homes are settled — both go to forest-evening.
4. Run `tools/loopify-scenes.py`, then `npx tsc --noEmit` +
   `npx vitest run` (sceneCatalogue conformance covers lengths/offsets).
5. **Audition before committing** — CSV descriptions flag crows, faint
   traffic, wind gusts; a sharp transient near a trim point is a wake risk.
   Tightest trim headroom is #612 at +9 s over its 199 offset + 6 s wrap.
6. Waterfall-valley is a NEW scene: needs scene JSON + index entry +
   3 Midnight-Editorial photos before it ships in the UI, and a call on its
   third element (see "Element homes").
7. Suggested landing order: #299 → creeks → rain-on-window → monsoon →
   forest-evening → waterfall-valley.

**Gotchas:** don't extract full ZIPs into the Drive-synced repo folder;
RecID numbers exist only in the metadata CSV — match by filename (appendix
in the selection note maps every #RecID to its exact filename).

The 20 files to extract from the All In One Immersive Bundle ZIPs, grouped by
the filename prefix (which should match how the ZIPs are organized). Drop them
all, original filenames intact, into **`incoming-ftus/`** at the repo root
(gitignore it or delete after processing) — the pipeline in
`notes/personal-sounds-selection-2026-08-17.md` handles front-pair extraction,
placement, sidecars, and loopify from there. Destination scene/element and
trim offset noted per file.

## Which Gumroad ZIPs to download (2026-08-18 mapping)

The Gumroad page splits the ORTF 3D library into 36 numbered category ZIPs
with no per-file manifest. Predicted location of each pick, derived from
cumulative raw sizes (duration x 8ch/32-bit/96kHz ~ 3.07 MB/s) walked
alphabetically against the published ZIP sizes — the model cross-checks
within a consistent ~14% zip-compression factor on every category, but
files flagged near a boundary may spill into the adjacent ZIP:

| ZIP | Size | Picks expected inside |
|---|---|---|
| ORTF3D_AMBIENCE_03 | 11.2 GB | #200 (forest wind+birds) |
| ORTF3D_AMBIENCE_05 | 9.2 GB | #233, #234 (grassland crickets) |
| ORTF3D_AMBIENCE_08 | 12.1 GB | #299 (Rayong harbor) |
| ORTF3D_AMBIENCE_12 | 10.6 GB | #373 (gentle waves, alternate) |
| ORTF3D_AMBIENCE_15 | 10.8 GB | #450 (waves + crickets) |
| ORTF3D_ANIMALS_01 | 1.9 GB | #612 (cricket chorus) |
| ORTF3D_RAIN_01 | 15.1 GB | #643, #656 |
| ORTF3D_RAIN_02 | 12.6 GB | #668, #669, #670 |
| ORTF3D_WATER_01 | 13.4 GB | #800, #801, #803, #701 (97% — may be in _02) |
| ORTF3D_WATER_02 | 11.0 GB | #709 |
| ORTF3D_WATER_03 | 10.8 GB | #726, #733 (96% — may be in _04) |
| ORTF3D_WATER_04 | 10.5 GB | #737 |
| ORTF3D_WATER_05 | 9.7 GB | #755, #764 |

## VERIFIED MAPPING — 2026-08-18, desktop (supersedes the predicted table above)

All 16 ZIPs were indexed by reading each central directory (no extraction);
picks were matched on exact filename and confirmed by `ffprobe` duration
against the RecID appendix in `notes/personal-sounds-selection-2026-08-17.md`.
**All 20 picks are extracted** to `D:\Sounds\picked\` (24 GB, outside the
Drive-synced tree), every one 8ch / 96 kHz / 32-bit float, every duration an
exact match for its RecID.

| ZIP | Picks actually inside |
|---|---|
| ORTF3D_AMBIENCE_03 | #200 |
| ORTF3D_AMBIENCE_05 | #233, #234 |
| ORTF3D_AMBIENCE_08 | #299 |
| ORTF3D_AMBIENCE_15 | #450 |
| ORTF3D_ANIMALS_01 | #612 |
| ORTF3D_RAIN_01 | #643, #656 |
| ORTF3D_RAIN_02 | #668, #669, #670 |
| ORTF3D_WATER_01 | #701, #709 |
| ORTF3D_WATER_02 | #726, #733 |
| ORTF3D_WATER_03 | #737 |
| ORTF3D_WATER_04 | #755 |
| **ORTF3D_WATER_06** | **#800, #801, #803** |

**The size model's one real miss: WATER_06.** It predicted #800/#801/#803
(the WATRFall "Mossy Rock Cascade" trio — the whole `cascade-close` layer of
waterfall-valley) in WATER_01, and the note ruled WATER_06 out as "not
needed". In fact the WATER library is split by *category*, alphabetically:
WATER_01–02 = FLOW, WATER_03–05 = SURF, **WATER_06 = TURBULENCE +
WATERFALL**. No WATRFall file exists in any other WATER ZIP. WATER_06 was
downloaded and the trio extracted. AMBIENCE_12 and WATER_05 yielded nothing
(their listed picks, #373 and #764, are alternates, not part of the 20).

Lesson for any future pull: **match by category prefix, not by cumulative
size.** The filename prefix (AMBNaut / WATRFlow / WATRFall / WATRSurf /
RAINMetl / ...) maps directly to the ZIP's category subfolder.

## Categories checked and REJECTED — 2026-08-18

- **ORTF3D_WIND_01** (8.6 GB, downloaded, indexed, nothing pulled). Two
  categories. `VEGETATION` is the right material — forest treetops, wind
  through trees, wind in giant tree tops — but the longest is **308 s**, and
  every wind element in the catalogue sits at 409 (needs ≥415 s) or 521
  (needs ≥527 s). `TONAL` tops out at 484 s and is off-brief anyway
  ("howling", "eerie", "scary", interior window cracks, fridge hum). So the
  selection note's "no fit" verdict for every wind slot **holds — and the
  reason is duration, not quality.** The unlock, if wanted later, is
  re-keying a wind element to 199 or 251 the way `night-ambience` was
  re-keyed to 199; the risk is that wind gusts and the "wood creaking and
  rubbing" transients in those files are far more distinctive than a cricket
  chorus and would metronome at a 3–4 minute period. Not attempted.
- **ORTF3D_WINDOWS_01** (0.41 GB, downloaded, indexed, nothing pulled).
  Not window *weather* — it is motorised hotel-curtain foley (fabric sliding,
  25–39 s clips). Nothing usable; `rain-on-window` is served by #670/#656
  from the RAIN ZIPs.

Not needed: AMBIENCE 01-02, 04, 06-07, 09-11, 13-14, 16-23; WIND, WINDOWS,
WEATHER, and the small categories.

## Element homes — DECIDED 2026-08-18 (Andrew, by ear/judgement)

Two picks each fitted two slots, and a variant can only live in one element
because it must be trimmed to exactly that element's prime offset:

- **#726** (wild salmon river, 728.5 s) → **forest-evening / creek-trickle
  @ 691**. It is the *only* file in the whole bundle ≥527 s, so this also
  settles the next line.
- **#200** (dense bushland canopy, 428.1 s) → **forest-evening /
  wind-in-leaves @ 409** (not forest-day / distant-birds — the file is
  wind-forward, not bird-forward). forest-day's `distant-birds` keeps its
  current variants.

Consequences: **forest-evening becomes a fully-sourced 3-element scene**
(#643 @251, #200 @409, #726 @691). **waterfall-valley's `river-below` @521
has no source** — nothing else in the bundle reaches 527 s. When that scene
is built it either ships 2-element (cascade-close @251 x3 + falls-main @409,
which clears the ≥2-element hard rule but not the "ideally 3–4") or takes a
third layer at **199** from the WATER_06 leftovers (best candidates: the
260 s "Lush Forest, Water Running Over Rocks, Small Creek" or the 294 s
"Front and Rear Flow") — all-water layering risks spectral mush, so audition.

## AMBNaut (nautical ambience)

- [x] `AMBNaut-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Thailand-Ambience, Nautical, Fishing Harbor, Seaside, Bird Activity, Water Splashing, Jetty, Morning, Distant Shipyard Repair Activity, Rayong.WAV`
      → ocean-night / dockside-distant @ 521

## WATRSurf (surf)

- [x] `WATRSurf-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Surf, Calm Ocean Waves on Small Rocks, Short Interval Lapping, Gentle Splashing, Evening Atmosphere, Quiet Tourist Location, Relaxing Coastal Soundscape, Tasmania, 03.wav`
      → ocean-night / waves @ 251
- [x] `WATRSurf-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Surf, Massive Sand Beach with Large Rocks, Gentle Wave Impacts and Backwash, Calm Low Surf, Evening Atmosphere, Quiet Coastal Setting, Tasmania.WAV`
      → ocean-night / waves-far @ 409

## AMBSea (seaside ambience)

- [x] `AMBSea-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Seaside, Sand Beach Perspective, Long Rushing Waves, Crickets in Bush, Calm Coastal Atmosphere, Undisturbed Nature, Tasmania, 03.wav`
      → ocean-night / waves @ 251 (second variant)

## WATRFlow (water flow)

- [x] `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Flow, Crystal Clear Forest Stream, Lush Greenery, Rocky Creek Bed, Undisturbed Nature, Daytime, Undisturbed Nature Tasmania.wav`
      → forest-day + forest-night / creek-trickle @ 251
- [x] `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Flow, Calm Forest River, Gentle Trickle Over Rocks, Wind in Tree Tops, Evening Atmosphere, Birds Chirping, Relaxing Natural Ambience, Undisturbed Nature, Tasmania, 04.wav`
      → forest-day + forest-night / creek-trickle @ 251 (second variant)
- [x] `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Flow, Strong Natural River, Wild Salmon River, Powerful Current, Calming yet Wild Atmosphere, Continuous Stream Energy, Undisturbed Nature, Tasmania, 02.WAV`
      → forest-evening / creek-trickle @ 691 AND/OR waterfall-valley / river-below @ 521 (one WAV, decision pending audition)
- [x] `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Thailand-Water, Flow, Waterfall, Calm Yet Powerful Flow, Forest, Occasional Bird Activity, Evening, Sunset, Natural Soundscape, Isan.WAV`
      → waterfall-valley / falls-main @ 409

## WATRFall (waterfalls)

- [x] `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Mossy Rock Cascade, Gentle Drop, Outflow Creek, Birds Chirping, Calm Forest Atmosphere, Undisturbed Nature, Tasmania, 01.WAV`
      → waterfall-valley / cascade-close @ 251
- [x] `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Mossy Rock Cascade, Gentle Drop, Outflow Creek, Birds Chirping, Calm Forest Atmosphere, Undisturbed Nature, Tasmania, 02.WAV`
      → waterfall-valley / cascade-close @ 251 (second variant)
- [x] `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Mossy Rock Cascade, Gentle Drop, Outflow Creek, Birds Chirping, Calm Forest Atmosphere, Undisturbed Nature, Tasmania, 04.WAV`
      → waterfall-valley / cascade-close @ 251 (third variant)

## AMBForst (forest ambience)

- [x] `AMBForst-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Forest, Dense Bushland, High Tree Canopy, Wind Rushing Through Tree Tops, Mixed Bird Calls, Cloudy Moody Atmosphere, Undisturbed Nature, Tasmania.WAV`
      → forest-day / distant-birds @ 409 (or forest-evening wind — one home, audition decides)

## RAIN / RAINPlas / RAINMetl (rain)

- [x] `RAIN-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Thailand-Rain, General, Apartment Window Perspective, Rain on Garden Leaves, Varying Rain Intensity, Birds Chirping, Faint Distant Traffic, Quiet Residential Area, Ekkamai, Bangkok.wav`
      → forest-evening / forest-rain @ 251
- [x] `RAINPlas-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Plastic, Umbrella Perspective, Rain Drips, Lakeside Environment, Cold Morning, Birds and Crows, Calm and Relaxing Atmosphere, Experimental Texture, Campsite Setting, Tasmania, 01.WAV`
      → rain-on-window / rain-on-glass @ 409
- [x] `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal Roof Shed, Wind Driven Rain, Open Door Perspective, Wind in Trees, Storm Atmosphere, Residential Area, Geelong, 13.WAV`
      → rain-on-window / rain-pavement @ 521
- [x] `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal, Roof, Residential Neighborhood, Rain Hitting Roof and Concrete, Crickets, Birds, Evening Atmosphere, Occasional Car Pass Bys, Albury, 06.wav`
      → monsoon / rain @ 251
- [x] `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal, Roof, Residential Neighborhood, Rain Hitting Roof and Concrete, Crickets, Birds, Evening Atmosphere, Occasional Car Pass Bys, Albury, 07.wav`
      → monsoon / rain @ 251 (second variant)

## ANMLInsc / AMBGras (cricket beds — the new 199 offset)

- [x] `ANMLInsc-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Animals, Insect, Dense Cricket Chorus, Grass Habitat, Evening Insect Bed, Rhythmic Chirping, Calm Night Atmosphere, Natural Wildlife Ambience, Geelong, Victoria, 02.wav`
      → forest-night / night-ambience @ 199 (the anchor — pure chorus, no birds)
- [x] `AMBGras-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Grassland, Evening Field Atmosphere, Crickets in Grass, Crows Cawing, Flies Buzzing, Distant Wind in Trees, Calm Rural Setting, Tasmania, 01.wav`
      → forest-night / night-ambience @ 199 (audition — crow caws may metronome at 3:19)
- [x] `AMBGras-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Grassland, Evening Field Atmosphere, Crickets in Grass, Crows Cawing, Flies Buzzing, Distant Wind in Trees, Calm Rural Setting, Tasmania, 02.wav`
      → forest-night / night-ambience @ 199 (audition — same caveat)

## Notes

- forest-night's `night-ambience` element gets re-keyed 409 → 199 in the
  scene JSON when these land (the 199 prime is already in
  `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`); until then the JSON is untouched
  so the conformance test stays green against the current files.
- Everything is 8-channel ORTF 3D — do NOT downmix or convert while pulling;
  the pipeline extracts the front pair itself.
