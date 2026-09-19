# Audio sources

Where the scene audio actually comes from, what it goes through before it
ships, and what is worth looking for next.

**Rewritten 2026-09-19.** The previous version was a pre-sourcing browsing
wishlist written before any audio existed. Almost none of its recommendations
survived contact with the work — it ranked Freesound first and FTUS last, and
the opposite is true — so it was replaced rather than patched. The rules that
govern scene audio live in `CLAUDE.md`; the reasoning behind the sourcing
decisions is in `DECISIONS.md` ("Clean single-producer audio source",
"Ship scene audio as Opus, not MP3").

---

## Where the catalogue came from

74 scene variants across 10 scenes, 9 shipping and 1 held back.

| Source | Files | What it is |
|---|---|---|
| **Free To Use Sounds** | ~37 | A purchased bundle ("All In One Immersive Bundle"). The largest single source. Personal build only — derivative works are permitted, the originals may not be redistributed. |
| **George Vlad / Mindful Audio** | ~21 | Free long-form releases on his YouTube channel, pulled with yt-dlp. A single recordist, pristine remote field recordings, often 1–2h+. |
| **FOBOS PLANET** | 5 | The free "Fireplace 12h" YouTube release; the whole fireplace scene. |
| **Pixabay** | 6 | Early material, mostly in rain-on-window. Pixabay's licence fails a redistribution test, which is moot now the app is explicitly personal-use. |
| **user-provided** | 2 | Andrew's own recordings. |
| **audiocraft MusicGen** | 5 | Locally generated, **rejected**, and held back with the singing-bowl scene. |
| **synthesized** | 3 | The pre-rendered brown/pink/white noise beds in `public/audio/_bed/`. |

Per scene:

| Scene | Sources |
|---|---|
| fireplace | FOBOS PLANET ×5 |
| forest-day | George Vlad ×5, FTUS ×2, Pixabay ×1, user ×1 |
| forest-evening | George Vlad ×6, FTUS ×5 |
| forest-night | FTUS ×3 |
| monsoon | George Vlad ×5, FTUS ×4 |
| night-train | FTUS ×4 |
| ocean-night | FTUS ×6, George Vlad ×5 |
| rain-on-window | Pixabay ×5, FTUS ×2, user ×1 |
| waterfall-valley | FTUS ×6 |
| singing-bowl *(held back)* | MusicGen ×5, rejected |

**Every shipped file has a `.json` sidecar beside it** recording its source,
licence, and exactly what was done to it — which prime offset it was cut to,
where in the source the loop starts and why, what level it was normalised to,
and any quality warning. The sidecar is the provenance record; treat writing
one as part of shipping a file, not an afterthought. `sceneCatalogue.test.ts`
hard-fails on a variant whose sidecar has no `trimmedTo`.

---

## What was tried and rejected

Worth knowing so nobody re-walks these.

- **Freesound** was the original plan and is not used at all. klankbeeld was
  staged as the single clean CC-BY recordist and rejected as too dirty
  (2026-06-30).
- **AI generation.** audiocraft MusicGen-medium was generated locally for the
  singing-bowl bed and rejected layer by layer on 2026-06-21 — "screeching
  teapot", "industrial ghost music", "old-school mp3 warble". MusicGen stays
  rejected. This is the one place the old document was right.
- **Paid effects marketplaces** (ASoundEffect, Boom, Pro Sound Effects,
  SoundDogs) and the BBC archive were surveyed and never used. One bundle
  purchase covered more ground than a per-file budget would have.
- **"Skip YouTube"** was the old advice and it was wrong. Two named
  recordists' free YouTube releases are now the backbone of the catalogue.
  The thing to actually avoid is the *anonymous* "10 hours of rain" upload,
  which usually is a short loop.

---

## The pipeline

A recording does not go into `public/audio/` by hand. Full rules in
`CLAUDE.md` under "Scene authoring"; the short version:

1. **Level it.** `tools/level-ftus.py` for a multichannel master — mind
   `--layout`, because FTUS puts the channel layout in the filename prefix
   (`L,R` / `M,S,Cs` / `W,Y,Z,X` for ambisonic B-format). `--balance` fixes a
   standing L/R difference, which matters over eight hours.
2. **Check it for intrusions.** `tools/scan-tonal-events.py` finds narrow
   tonal events in a broadband bed, and faster-whisper with VAD finds speech.
   Do both. A bird or a voice that returns every 251 seconds all night is the
   failure this catches — one shipped for weeks before anyone noticed.
3. **Cut the loop.** `tools/loopify-scenes.py` trims each variant to its
   element's prime offset with a gapless wrap and emits Opus at 48 kHz. Give
   the loop-start search slack: `sourceDuration - loopOffset - 6` is its
   entire search range, and under ~30 s it cannot beat a slow swell.
4. **Audit it.** `python tools/loopify-scenes.py --audit` measures the wrap
   step of every shipped variant. Over 3 dB wants a re-cut.
5. **Write the sidecar and listen.** Measurement does not tell you whether a
   recording is pleasant. Andrew's ear is the gate, and it has overruled
   clean numbers before.

Directory layout, unchanged since the beginning and still correct:

```
public/audio/<scene-id>/<element-id>/<variant-id>.opus
public/audio/<scene-id>/<element-id>/<variant-id>.json   # sidecar
public/audio/_bed/<color>.opus                            # synth beds
```

---

## Still wanted

**A bed to replace singing-bowl.** The open sourcing task. The decision
(2026-07-01) is a warm ambient pad/drone rather than bowls, voiced to sit
under narration: HPF ~80–100 Hz, a 200–500 Hz dip, 2–4 kHz left clear for
consonants. Two routes are on record in `.handoff/PENDING-DECISIONS.md` —
the 99Sounds "Drones" library by Red Fog, or DSP synthesis.

**A second variant for `waterfall-valley/falls-main`,** which ships one.

**Scenes that were sketched and never built.** Search terms kept from the old
document because they are still the right ones:

| Scene | Search terms that work | Watch out for |
|---|---|---|
| Rain on tent | `rain canvas tent`, `camping rain` | Wind that is too active |
| Rain on roof | `rain roof shingles`, `attic rain` | Close-up dripping — too rhythmic, becomes a metronome |
| Airplane cabin | `airplane interior cruise 10 hour` | Announcements, departure and landing |
| Spaceship | `sci fi engine hum` | Anything labelled horror — wrong vibe per the brief |

General cautions that have held up: designed nature scenes where the birds
are soloists rather than bed; coyote howls and dramatic owl calls in night
forest; waterfalls so loud the high-frequency hiss dominates; new-age bowl
music with chord changes, when what is wanted is drone.
