# Clean audio-source research — 2026-06-30

Deep-research harness (102 agents, 19 sources, 22/25 claims verified) to find a
large, clean, curated, single-producer source to replace the dirty scene audio
after klankbeeld was rejected. Context: app is now personal-use / non-commercial,
so license is not a gate — **cleanliness is the #1 test**.

## Ranked shortlist

### 1. George Vlad / Mindful Audio — TOP PICK (nature)
- Single professional field recordist; **18+ well-tagged libraries** (Wild Rain,
  Amazon/African Jungle, Woodland Atmosphere, Eerie Forest, Nordic Nature,
  Volcano, Whale Song, …). Rich per-pack metadata (file counts, runtimes,
  species lists).
- **Cleanliness:** records "pristine soundscapes free from human influence" in
  remote/inhospitable locations; documented anti-artifact rig (Sound Devices 633
  + Sennheiser Double M/S, improvised canopies to kill raindrop-plops).
  Corroborated by A Sound Effect, Creative Field Recording, Sennheiser. CAVEAT
  (one 2-1 split vote): "free from human influence" is *intent* — he concedes
  ubiquitous plane noise and occasional surgical spectral edits. Expect a few
  light cuts, but **far cleaner than klankbeeld**.
- **Long-form:** yes — e.g. Wild Rain = 8h43m across 4 rainforests.
- **Format:** 24-bit/96kHz stereo (+5.0 surround) WAV — exceeds our spec,
  downsamples cleanly.
- **Environment coverage:** forest, rain, thunderstorm, jungle, volcanic, Nordic.
  GAPS: "ocean" is mostly underwater/marine (Whale Song), NOT gentle surface
  waves; rain is jungle/forest rain w/ intentional wildlife, not rain-on-glass.
- **License/cost:** paid, per-library, via mindful-audio.com + A Sound Effect.
  Non-commercial EULA terms NOT yet verified. **Free path to verify:** his
  YouTube channel + earth.fm host long-form recordings (the yt-dlp target).

### 2. Quiet Planet / Gordon Hempton — strongest alternative (nature)
- Single acoustic ecologist ("The Sound Tracker"). **Huge:** 106+ hrs, 4,573
  files, 17 packs. Genuine long-form continuous takes (61-min rainstorm, 41-min
  thunderstorm) — ideal for all-night looping. Has a **Waves pack (111 loops)** —
  the better source for our gentle-ocean need than Vlad.
- **Format:** 24-bit/48kHz WAV stereo (+5.0 surround top edition).
- **License/cost:** premium paid — ~$219/pack, Complete ~$1,375+. License
  forbids products that are 50%+ pure nature sound (no standalone nature-only) —
  fine for personal use now, but a **commercial pivot would need relicensing.**

### 3. Jan Brelih / Earth Experience — credible boutique third (nature)
- Sole recordist since 2018; ultra-low-noise rig (Nevaton MC59 + Sound Devices
  MixPre II); remote untouched ecosystems. Smaller catalogue (~15 albums + 3 SFX
  libs) but real long-form per library. Narrower breadth than Vlad/Hempton.

### Ruled out
- **myNoise (Stéphane Pigeon):** real-time generators, not downloadable
  long-form files; license explicitly forbids extracting stems / resampling
  output. Cannot feed our file-based loop pipeline.

## CRITICAL GAPS (need a separate source regardless of pick)
- **Fireplace / campfire crackle** — absent from all three nature recordists.
- **Singing bowls** — absent from all three (also needed for the meditation
  sound-bath bed).
- **Gentle night ocean (surface waves)** — Vlad is marine; use Quiet Planet
  Waves or another surf source.

## Free-vs-paid (the open decision)
The top-quality picks are PAID commercial libraries, but Vlad (and others) also
publish long-form recordings free on **YouTube / earth.fm**. For a personal
sleep app that downsamples to MP3 and loops quietly overnight, lossy YouTube
versions of the *same recordings* are likely ~as good for our use case — because
the thing that matters (cleanliness) is identical; studio 24/96 WAV mainly
benefits pro sound-design, not a quiet overnight bed. So purchase is probably
NOT worth it unless a specific clean scene we need isn't available free.
**Next:** verify Vlad's free YouTube/earth.fm catalogue + test-grab to confirm
quality, then map his content to our scenes. Sources captured in
`tasks/wygozs5kt.output` (workflow run wf_95409cd4-811).
