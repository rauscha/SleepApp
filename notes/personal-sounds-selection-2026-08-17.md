# Personal-use sound selection — Free To Use Sounds bundle — 2026-08-17

Stopgap sourcing pass until we record our own material. Source: the
**purchased** Free To Use Sounds "All In One Immersive Bundle" (Marc Steffen;
724 recordings; metadata CSV `ORTF_3D_Metadata.csv` ships with the bundle —
look picks up by the `RecID` column, and the appendix at the bottom of
this note carries the exact bundle filename for every referenced RecID).
License: purchased FTUS
bundle — © Free To Use Sounds LLC, all rights reserved; fine for the personal
build, and unlike the George Vlad YouTube grabs it's *properly licensed*, so
these picks also retire the murkiest attributions in the catalogue.

Bundle shape, per the CSV: mostly Tasmania/Victoria/Thailand field recordings,
8-channel **ORTF 3D** (L/R/Ls/Rs/Lh/Rh/Lsh/Rsh) 32-bit/96 kHz WAV. Median
length 180 s; 205 files clear the 251 s prime, 44 clear 409 s, 18 clear 521 s,
4 clear 691 s. Duration is the gate everywhere below: a variant must be at
least its element's `loopOffsetSeconds` + ~6 s (loopify's gapless wrap tail).

## Pipeline (per pick)

1. Copy the WAV from the bundle drive; extract the **front ORTF pair only** —
   do NOT let a generic downmix fold the rear/height channels into stereo
   (diffuse mush + comb risk). `loopify-scenes.py` uses plain `-ac 2`
   internally, so pre-extract first:

   ```
   ffmpeg -i "<bundle file>.wav" -af "pan=stereo|c0=c0|c1=c1" -ar 48000 \
     public/audio/<scene>/<element>/<variant>.wav
   ```

2. Write the license sidecar next to it (template):

   ```json
   {
     "source": "Free To Use Sounds — All In One Immersive Bundle (purchased)",
     "recId": "709",
     "url": "https://www.freetousesounds.com/",
     "license": "Purchased FTUS bundle; (c) Free To Use Sounds LLC, all rights reserved. Personal build only — do not redistribute.",
     "downloadedAt": "2026-08-17",
     "notes": "Front ORTF pair extracted from 8ch ORTF 3D master; see notes/personal-sounds-selection-2026-08-17.md"
   }
   ```

3. Add the variant to the scene JSON at the offsets below, run
   `tools/loopify-scenes.py` (trims to prime + emits `.opus`), then
   `npx vitest run` — `sceneCatalogue.test.ts` verifies lengths/offsets.
4. **Audition before committing.** Descriptions below carry caveats
   (crows, distant traffic, dog barks); the CSV can't tell us how loud they
   are. Anything with a sharp transient near the trim point is a wake risk.

## Picks by scene

Format: `#RecID (length)` — all IDs are the CSV `RecID` column.

### forest-day
- **creek-trickle (251 s)** — `#709 (361s)` crystal-clear forest stream,
  rocky bed, Tasmania — the cleanest water in the bundle. `#701 (313s)` calm
  forest river, evening birds. Alternates: `#208/#207 (275/272s)` rainforest
  creek. These can replace the Pixabay/user-provided creeks and are shared
  into forest-night as today.
- **distant-birds (409 s)** — `#200 (428s)` dense bushland, canopy wind +
  mixed bird calls, moody. Caveat: wind-forward rather than bird-forward;
  audition against the brief's "bed, not soloists".
- **wind-in-leaves (521 s)** — **no clean fit** (nothing forest-clean ≥527 s);
  keep the current variants.

### forest-night
- **creek-trickle (251 s)** — share `#709`/`#701` (same files as forest-day,
  same reuse pattern as today).
- **night-ambience (409 s) / wind (521 s)** — **no fit.** The bundle's lovely
  dense-cricket beds (`#612` 214 s, `#611` 180 s, `#235` 251 s) all land *just
  under* the smallest prime + wrap (≥257 s needed). Keep current variants.

### forest-evening
- **forest-rain (251 s)** — `#643 (391s)` rain on garden leaves at varying
  intensity, Bangkok. Caveat: faint distant traffic — should vanish at the
  element's low level, but audition.
- **wind-in-leaves (409 s)** — `#200 (428s)` (shared with forest-day's 409
  slot; different trim length would be needed if used in both — prefer it
  here OR there, not both, to keep the pool varied).
- **creek-trickle (691 s)** — `#726 (728s)` wild salmon river, strong
  continuous current — the only water ≥697 s. Caveat: more energetic than
  "slow creek"; audition at the element's volume.
- **distant-birds (521 s)** — **no fit**; keep current.

### rain-on-window
- **rain-on-glass (409 s)** — `#670 (540s)` rain droplets on umbrella
  surface, lakeside — closest droplet-on-surface texture to glass in the
  bundle.
- **rain-pavement (521 s)** — `#656 (634s)` wind-driven rain on metal shed
  roof, open-door perspective. Caveat: wind gusts; audition.
- **distant-thunder-rumble (251 s)** — **no clean fit** (`#662` has thunder
  but also a barking dog — wake risk); keep current.
- Alternate for either rain slot: `#671 (745s)`, same umbrella series.

### monsoon
- **rain (251 s)** — `#669 (340s)` / `#668 (315s)` rain on metal roof with
  crickets + birds (Albury) — reads tropical, fits the scene. Storm-driven
  alternates: `#646/#648/#650 (~300s each)`.
- **rain-distant (409 s)** — `#657` is 407 s (2 s short — cruel); use
  `#656 (634s)` trimmed to 409 instead, or reserve #656 for rain-on-window
  and keep this element as-is.
- **thunder-rumble (521 s)** — **no fit** (bundle thunder is short/dirty);
  keep current.

### ocean-night
- **waves (251 s)** — `#737 (364s)` calm evening lapping over small rocks;
  `#450 (314s)` long rushing waves on sand **with crickets** — great for a
  night scene. Alternate: `#373 (466s)` slow gentle lapping (distant
  construction caveat).
- **waves-far (409 s)** — `#755 (465s)` gentle surf, soft impacts + backwash,
  calm evening. Alternate: `#764 (600s)` more powerful sunrise surf (bird
  caveat).
- **dockside-distant (521 s)** — `#299 (879s)` Rayong fishing harbor: water
  splashing on the jetty, birds, **distant shipyard repair** — this is almost
  literally the element's description. Best single thematic match in the
  bundle.

### fireplace / singing-bowl
Zero fire or bowl material in the bundle (searched: 0 hits). Unchanged —
same gap the 2026-06-30 research note flagged across all nature recordists.

## New scene candidate: Waterfall valley

The bundle's waterfall/flow coverage is deep enough for a *new* scene that
was on the original AUDIO_SOURCES wishlist, with proper 3-element layering:

- **cascade-close (251 s)** — `#800 (365s)`, `#803 (365s)`, `#801 (319s)`:
  gentle mossy-rock cascade into an outflow creek, birds, Tasmania — three
  real variants of the same calm falls.
- **falls-main (409 s)** — `#733 (520s)` steady-but-powerful forest waterfall
  at sunset, Isan, light birds.
- **river-below (521 s)** — `#726 (728s)` strong river (if not spent on
  forest-evening's 691 slot — pick one home for it).
- Synth bed: pink or brown, ~0.12.

Voicing per the mix rule: cascade ~0.55, falls-main ~0.30, river ~0.25.
Needs 3 photos in the Midnight Editorial style before it ships in the UI.

## Not worth pursuing from this bundle

- **Lakeside morning scene** — `#264/#255/#256` are lovely but all fit only
  the 251 slot; can't build ≥2 distinct-offset elements cleanly.
- **Room tone / ship cabin / hotel** (`#329–#335`, `#318–#320`) — flat
  interior beds ~300 s; could serve a future "ship cabin" scene at 251 but
  the ventilation-fan hull-impact character needs an ear test first.
- Urban/traffic/voices/horns categories — off-brief entirely.

## Suggested landing order

1. `#299` into ocean-night dockside (biggest upgrade, perfect fit).
2. `#709`/`#701` creeks into forest-day/night (retires the weakest current
   attributions).
3. rain-on-window `#670`/`#656`.
4. monsoon rain `#669`/`#668`.
5. forest-evening `#643` (+ decide `#726`'s home).
6. Waterfall-valley scene build (new scene JSON + photos + catalogue entry).

## Appendix — bundle filenames for every referenced RecID

Durations are mm:ss from the bundle metadata. Filenames are verbatim
(search the bundle drive for the trailing descriptive part).

- **#299** (14:39) `AMBNaut-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Thailand-Ambience, Nautical, Fishing Harbor, Seaside, Bird Activity, Water Splashing, Jetty, Morning, Distant Shipyard Repair Activity, Rayong.WAV`
- **#709** (06:01) `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Flow, Crystal Clear Forest Stream, Lush Greenery, Rocky Creek Bed, Undisturbed Nature, Daytime, Undisturbed Nature Tasmania.wav`
- **#701** (05:13) `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Flow, Calm Forest River, Gentle Trickle Over Rocks, Wind in Tree Tops, Evening Atmosphere, Birds Chirping, Relaxing Natural Ambience, Undisturbed Nature, Tasmania, 04.wav`
- **#208** (04:35) `AMBForst-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Forest, Flowing Creek, Bushy Rainforest, Lush Green Vegetation, Gentle Water Movement, Calm Natural Atmosphere, Undisturbed Nature, Tasmania, 03.wav`
- **#207** (04:32) `AMBForst-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Forest, Flowing Creek, Bushy Rainforest, Lush Green Vegetation, Gentle Water Movement, Calm Natural Atmosphere, Undisturbed Nature, Tasmania, 02.wav`
- **#200** (07:08) `AMBForst-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Forest, Dense Bushland, High Tree Canopy, Wind Rushing Through Tree Tops, Mixed Bird Calls, Cloudy Moody Atmosphere, Undisturbed Nature, Tasmania.WAV`
- **#643** (06:31) `RAIN-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Thailand-Rain, General, Apartment Window Perspective, Rain on Garden Leaves, Varying Rain Intensity, Birds Chirping, Faint Distant Traffic, Quiet Residential Area, Ekkamai, Bangkok.wav`
- **#726** (12:08) `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Flow, Strong Natural River, Wild Salmon River, Powerful Current, Calming yet Wild Atmosphere, Continuous Stream Energy, Undisturbed Nature, Tasmania, 02.WAV`
- **#670** (09:00) `RAINPlas-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Plastic, Umbrella Perspective, Rain Drips, Lakeside Environment, Cold Morning, Birds and Crows, Calm and Relaxing Atmosphere, Experimental Texture, Campsite Setting, Tasmania, 01.WAV`
- **#671** (12:25) `RAINPlas-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Plastic, Umbrella Perspective, Rain Drips, Lakeside Environment, Cold Morning, Birds and Crows, Calm and Relaxing Atmosphere, Experimental Texture, Campsite Setting, Tasmania, 02.WAV`
- **#656** (10:34) `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal Roof Shed, Wind Driven Rain, Open Door Perspective, Wind in Trees, Storm Atmosphere, Residential Area, Geelong, 13.WAV`
- **#657** (06:47) `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal Roof Shed, Wind Driven Rain, Open Door Perspective, Wind in Trees, Storm Atmosphere, Residential Area, Geelong, 14.wav`
- **#662** (08:08) `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal, Roof Shed, Rain Starting then Increasing, Thunder Claps, Dog Barking, Storm Arriving, Wind in Trees, Residential Garden Atmosphere, Geelong, Victoria.wav`
- **#669** (05:40) `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal, Roof, Residential Neighborhood, Rain Hitting Roof and Concrete, Crickets, Birds, Evening Atmosphere, Occasional Car Pass Bys, Albury, 07.wav`
- **#668** (05:15) `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal, Roof, Residential Neighborhood, Rain Hitting Roof and Concrete, Crickets, Birds, Evening Atmosphere, Occasional Car Pass Bys, Albury, 06.wav`
- **#646** (05:00) `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal Roof Shed, Wind Driven Rain, Open Door Perspective, Wind in Trees, Storm Atmosphere, Residential Area, Geelong, 03.wav`
- **#648** (05:00) `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal Roof Shed, Wind Driven Rain, Open Door Perspective, Wind in Trees, Storm Atmosphere, Residential Area, Geelong, 05.wav`
- **#650** (05:00) `RAINMetl-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Rain, Metal Roof Shed, Wind Driven Rain, Open Door Perspective, Wind in Trees, Storm Atmosphere, Residential Area, Geelong, 07.wav`
- **#737** (06:04) `WATRSurf-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Surf, Calm Ocean Waves on Small Rocks, Short Interval Lapping, Gentle Splashing, Evening Atmosphere, Quiet Tourist Location, Relaxing Coastal Soundscape, Tasmania, 03.wav`
- **#450** (05:14) `AMBSea-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Seaside, Sand Beach Perspective, Long Rushing Waves, Crickets in Bush, Calm Coastal Atmosphere, Undisturbed Nature, Tasmania, 03.wav`
- **#373** (07:46) `AMBSea-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Seaside, Beach Ambience, Rock Shore Perspective, Slow Gentle Waves Lapping, Occasional Distant Construction Activity, Calm Wind Atmosphere, Secluded Beach, Tasmania.WAV`
- **#755** (07:45) `WATRSurf-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Surf, Massive Sand Beach with Large Rocks, Gentle Wave Impacts and Backwash, Calm Low Surf, Evening Atmosphere, Quiet Coastal Setting, Tasmania.WAV`
- **#764** (10:00) `WATRSurf-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Surf, Ocean Waves on Small Rocks, Early Morning Birds, Grazing Pademelons, Lighthouse Atmosphere, Wind in Bush, Calm Coastal Setting, Tasmania, 02.WAV`
- **#776** (05:28) `WATRSurf-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Surf, Sunrise Coastal Town Beach, Waves Rolling Back Over Pebbles and Rocks, Gentle Backwash Texture, Parrots Calling, Early Morning, Relaxed Coastal Setting, Tasmania, 01.WAV`
- **#800** (06:05) `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Mossy Rock Cascade, Gentle Drop, Outflow Creek, Birds Chirping, Calm Forest Atmosphere, Undisturbed Nature, Tasmania, 01.WAV`
- **#803** (06:05) `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Mossy Rock Cascade, Gentle Drop, Outflow Creek, Birds Chirping, Calm Forest Atmosphere, Undisturbed Nature, Tasmania, 04.WAV`
- **#801** (05:19) `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Mossy Rock Cascade, Gentle Drop, Outflow Creek, Birds Chirping, Calm Forest Atmosphere, Undisturbed Nature, Tasmania, 02.WAV`
- **#733** (08:40) `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Thailand-Water, Flow, Waterfall, Calm Yet Powerful Flow, Forest, Occasional Bird Activity, Evening, Sunset, Natural Soundscape, Isan.WAV`
- **#790** (04:26) `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Close Perspective, Strong Water Impact and Spray, Lush Forest, Constant Flow Over Rocks, Calm No Wind Atmosphere, Sunny Day, Undisturbed Nature, Tasmania, 02.WAV`
- **#791** (04:56) `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Columnar Basalt Formation, Strong Flow and Spray, Forest Surroundings, Dense Woodland Ambience, Powerful Natural Cascade, Undisturbed Nature, Tasmania, 01.WAV`
- **#794** (04:53) `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Front and Rear Flow, Water Running Over Rocks, Continuous Cascade Movement, Lush Forest, Calm Natural Atmosphere, Undisturbed Nature, Tasmania.WAV`
- **#798** (04:20) `WATRFall-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Waterfall, Lush Forest, Water Running Over Rocks, Relaxing Splashing, Water Flow on Both Sides of Microphone, Small Creek, Undisturbed Nature, Tasmania, 04.wav`
- **#722** (06:55) `WATRFlow-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Water, Flow, Small Creek Into Lake, Close Perspective Above Water, Gentle Stream Movement, Calm Natural Atmosphere, Mountain Valley Setting, Undisturbed Nature, Tasmania, 02.wav`
- **#612** (03:34) `ANMLInsc-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Animals, Insect, Dense Cricket Chorus, Grass Habitat, Evening Insect Bed, Rhythmic Chirping, Calm Night Atmosphere, Natural Wildlife Ambience, Geelong, Victoria, 02.wav`
- **#611** (03:00) `ANMLInsc-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Animals, Insect, Dense Cricket Chorus, Grass Habitat, Evening Insect Bed, Rhythmic Chirping, Calm Night Atmosphere, Natural Wildlife Ambience, Geelong, Victoria, 01.wav`
- **#235** (04:11) `AMBGras-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Grassland, Evening Field Atmosphere, Crickets in Grass, Crows Cawing, Flies Buzzing, Distant Wind in Trees, Calm Rural Setting, Tasmania, 03.wav`
- **#264** (06:50) `AMBLake-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Lakeside, Early Morning After Rain, Cold Fresh Air, Calm Breeze, Birds Chirping, Mountain Valley Setting, Quiet Natural Atmosphere, Undisturbed Nature, Tasmania.WAV`
- **#255** (05:03) `AMBLake-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Lakeside, Calm Morning Ambience, Gentle Lake Waves on Shore, Birds Chirping, Crickets, Quiet Natural Atmosphere, Lush Green Hills, Campsite, Tasmania.wav`
- **#256** (05:31) `AMBLake-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Lakeside, Calm Shore Waves, Wind in Trees, Birds Chirping, Flies Buzzing, Cloudy Day Atmosphere, Natural Lakeside Ambience, Geelong, Victoria.wav`
- **#320** (08:30) `AMBRoom-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Room Tone, Hotel Room Interior, Windows Closed, Muffled City Traffic, Faint Room Noise, Distant Hotel Activity, Quiet Indoor Atmosphere, Tasmania, 05.WAV`
- **#333** (05:10) `AMBRoom-L,R,Ls,Rs,Lh,Rh,Lsh,Rsh_Australia-Ambience, Room Tone, Ship Cabin Interior, Rough Sea Movement, Waves Slapping Hull, Closed Window Perspective, Central Air System Fan, Vessel Pitch and Roll, Ocean Facing Cabin, Tasmania Crossing, 13.wav`
