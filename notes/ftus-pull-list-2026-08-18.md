# FTUS bundle — WAV pull list (2026-08-18)

## HAND-OFF — pick up here on desktop (2026-08-19)

**State:** Sound selection done and merged to main (cloud session,
2026-08-17/18). 199 prime added to `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`
(tests 259/259 green). The 13 needed Gumroad ZIPs (~139 GB) are downloaded
to **`D:\Sounds`**. No audio has been extracted or processed yet; no scene
JSON has changed.

**Next steps, in order:**
1. List each ZIP in `D:\Sounds` *without* extracting (PowerShell
   `System.IO.Compression` or `unzip -l`), match entries against the 20
   exact filenames below, and extract ONLY those into a folder **outside
   the Google-Drive-synced repo** (e.g. `D:\Sounds\picked\`). If a pick
   isn't in its predicted ZIP (mapping table below), check the
   adjacent-numbered ZIP — the prediction is a size model, ±1 at
   boundaries.
2. Per pick: extract the front ORTF pair (`pan=stereo|c0=c0|c1=c1`,
   48 kHz — NOT `-ac 2`), land the stereo WAV + license sidecar in
   `public/audio/<scene>/<element>/`, per the pipeline in
   `notes/personal-sounds-selection-2026-08-17.md`.
3. Wire variants into the scene JSONs at the offsets below. Forest-night:
   re-key `night-ambience` 409 → 199 when its 3 cricket variants land.
   Decide `#726`'s home (forest-evening @691 vs waterfall-valley @521) and
   `#200`'s (forest-day birds @409 vs forest-evening wind) by ear.
4. Run `tools/loopify-scenes.py`, then `npx tsc --noEmit` +
   `npx vitest run` (sceneCatalogue conformance covers lengths/offsets).
5. **Audition before committing** — CSV descriptions flag crows, faint
   traffic, wind gusts; a sharp transient near a trim point is a wake risk.
6. Waterfall-valley is a NEW scene: needs scene JSON + index entry +
   3 Midnight-Editorial photos before it ships in the UI.
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

13 ZIPs, ~139 GB total. Both boundary-risk files' neighbor ZIPs are already
on the list, so the set is self-covering. Not needed: AMBIENCE 01-02, 04,
06-07, 09-11, 13-14, 16-23; WATER_06; WIND, WEATHER, and the small
categories.

## AMBNaut (nautical ambience)

- [ ] `AMBNaut-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Thailand-Ambience, Nautical, Fishing Harbor, Seaside, Bird Activity, Water Splashing, Jetty, Morning, Distant Shipyard Repair Activity, Rayong.WAV`
      → ocean-night / dockside-distant @ 521

## WATRSurf (surf)

- [ ] `WATRSurf-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Surf, Calm Ocean Waves on Small Rocks, Short Interval Lapping, Gentle Splashing, Evening Atmosphere, Quiet Tourist Location, Relaxing Coastal Soundscape, Tasmania, 03.wav`
      → ocean-night / waves @ 251
- [ ] `WATRSurf-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Surf, Massive Sand Beach with Large Rocks, Gentle Wave Impacts and Backwash, Calm Low Surf, Evening Atmosphere, Quiet Coastal Setting, Tasmania.WAV`
      → ocean-night / waves-far @ 409

## AMBSea (seaside ambience)

- [ ] `AMBSea-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Seaside, Sand Beach Perspective, Long Rushing Waves, Crickets in Bush, Calm Coastal Atmosphere, Undisturbed Nature, Tasmania, 03.wav`
      → ocean-night / waves @ 251 (second variant)

## WATRFlow (water flow)

- [ ] `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Flow, Crystal Clear Forest Stream, Lush Greenery, Rocky Creek Bed, Undisturbed Nature, Daytime, Undisturbed Nature Tasmania.wav`
      → forest-day + forest-night / creek-trickle @ 251
- [ ] `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Flow, Calm Forest River, Gentle Trickle Over Rocks, Wind in Tree Tops, Evening Atmosphere, Birds Chirping, Relaxing Natural Ambience, Undisturbed Nature, Tasmania, 04.wav`
      → forest-day + forest-night / creek-trickle @ 251 (second variant)
- [ ] `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Flow, Strong Natural River, Wild Salmon River, Powerful Current, Calming yet Wild Atmosphere, Continuous Stream Energy, Undisturbed Nature, Tasmania, 02.WAV`
      → forest-evening / creek-trickle @ 691 AND/OR waterfall-valley / river-below @ 521 (one WAV, decision pending audition)
- [ ] `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Thailand-Water, Flow, Waterfall, Calm Yet Powerful Flow, Forest, Occasional Bird Activity, Evening, Sunset, Natural Soundscape, Isan.WAV`
      → waterfall-valley / falls-main @ 409

## WATRFall (waterfalls)

- [ ] `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Mossy Rock Cascade, Gentle Drop, Outflow Creek, Birds Chirping, Calm Forest Atmosphere, Undisturbed Nature, Tasmania, 01.WAV`
      → waterfall-valley / cascade-close @ 251
- [ ] `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Mossy Rock Cascade, Gentle Drop, Outflow Creek, Birds Chirping, Calm Forest Atmosphere, Undisturbed Nature, Tasmania, 02.WAV`
      → waterfall-valley / cascade-close @ 251 (second variant)
- [ ] `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Mossy Rock Cascade, Gentle Drop, Outflow Creek, Birds Chirping, Calm Forest Atmosphere, Undisturbed Nature, Tasmania, 04.WAV`
      → waterfall-valley / cascade-close @ 251 (third variant)

## AMBForst (forest ambience)

- [ ] `AMBForst-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Forest, Dense Bushland, High Tree Canopy, Wind Rushing Through Tree Tops, Mixed Bird Calls, Cloudy Moody Atmosphere, Undisturbed Nature, Tasmania.WAV`
      → forest-day / distant-birds @ 409 (or forest-evening wind — one home, audition decides)

## RAIN / RAINPlas / RAINMetl (rain)

- [ ] `RAIN-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Thailand-Rain, General, Apartment Window Perspective, Rain on Garden Leaves, Varying Rain Intensity, Birds Chirping, Faint Distant Traffic, Quiet Residential Area, Ekkamai, Bangkok.wav`
      → forest-evening / forest-rain @ 251
- [ ] `RAINPlas-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Plastic, Umbrella Perspective, Rain Drips, Lakeside Environment, Cold Morning, Birds and Crows, Calm and Relaxing Atmosphere, Experimental Texture, Campsite Setting, Tasmania, 01.WAV`
      → rain-on-window / rain-on-glass @ 409
- [ ] `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal Roof Shed, Wind Driven Rain, Open Door Perspective, Wind in Trees, Storm Atmosphere, Residential Area, Geelong, 13.WAV`
      → rain-on-window / rain-pavement @ 521
- [ ] `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal, Roof, Residential Neighborhood, Rain Hitting Roof and Concrete, Crickets, Birds, Evening Atmosphere, Occasional Car Pass Bys, Albury, 06.wav`
      → monsoon / rain @ 251
- [ ] `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal, Roof, Residential Neighborhood, Rain Hitting Roof and Concrete, Crickets, Birds, Evening Atmosphere, Occasional Car Pass Bys, Albury, 07.wav`
      → monsoon / rain @ 251 (second variant)

## ANMLInsc / AMBGras (cricket beds — the new 199 offset)

- [ ] `ANMLInsc-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Animals, Insect, Dense Cricket Chorus, Grass Habitat, Evening Insect Bed, Rhythmic Chirping, Calm Night Atmosphere, Natural Wildlife Ambience, Geelong, Victoria, 02.wav`
      → forest-night / night-ambience @ 199 (the anchor — pure chorus, no birds)
- [ ] `AMBGras-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Grassland, Evening Field Atmosphere, Crickets in Grass, Crows Cawing, Flies Buzzing, Distant Wind in Trees, Calm Rural Setting, Tasmania, 01.wav`
      → forest-night / night-ambience @ 199 (audition — crow caws may metronome at 3:19)
- [ ] `AMBGras-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Grassland, Evening Field Atmosphere, Crickets in Grass, Crows Cawing, Flies Buzzing, Distant Wind in Trees, Calm Rural Setting, Tasmania, 02.wav`
      → forest-night / night-ambience @ 199 (audition — same caveat)

## Notes

- forest-night's `night-ambience` element gets re-keyed 409 → 199 in the
  scene JSON when these land (the 199 prime is already in
  `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`); until then the JSON is untouched
  so the conformance test stays green against the current files.
- Everything is 8-channel ORTF 3D — do NOT downmix or convert while pulling;
  the pipeline extracts the front pair itself.
