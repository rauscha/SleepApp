# Audio sourcing — libraries to browse today

Browse these on your own and pick what feels right. I've ranked them by signal-to-noise for our specific use case (sleep-audio, 4+ minute continuous recordings, field-recording style — NOT atmospheric music or sound design).

What we're looking for at each scene:
- 44.1 or 48 kHz, stereo
- 4+ minutes continuous (longer is better — fewer crossfades over an 8-hour night)
- "Field recording" / "ambience" tags, NOT "FX" or "designed"
- License: CC0 ideal, CC-BY OK with attribution, BBC personal-use OK
- 2–4 variants per element so the rotation pool isn't repetitive

---

## Free first — start here

### 1. Freesound (https://freesound.org)
Community-uploaded library, mostly CC0 or CC-BY. **Best free starting point.**

Search tactics that work well for our scenes:
- `rain on window long` — surprisingly good multi-minute recordings
- `forest ambience field recording`
- `creek babbling 10 minutes`
- `crickets night`
- `waves gentle beach 5 minutes`
- `fireplace crackle` (filter for >4 min)

Tip: sort by Duration (descending) and filter by license = "Creative Commons 0".
Avoid: `sound design`, `cinematic`, `FX` — these are designed sounds, not ambience.

### 2. BBC Sound Effects archive (https://sound-effects.bbcrewind.co.uk)
Massive professional archive, **free for personal use** (their "RemArc license"). High-quality field recordings going back decades.
- Excellent for waves, rain, wind, forest. Their nature catalogue is solid.
- Caveat: license forbids redistribution, so we can't bundle these into a "share with friends" build later — only use for the personal build.

### 3. Pixabay sounds (https://pixabay.com/sound-effects/)
Pixabay license (free, no attribution required, commercial use OK). Smaller library but **everything is free and unrestricted**, which makes it the best fit if/when we later ship a static build to friends.
- Hit-or-miss quality; stick to highly-rated uploads.

### 4. George Vlad — field recordings (https://georgevlad.com)
Independent professional field recorder. Posts long-form nature recordings to YouTube and Bandcamp. **Some free, some pay-what-you-want.**
- Specifically excellent for forest, water, mountain ambiences.
- Often 30+ minute single-take recordings, perfect for our use case (long enough that the crossfade rarely fires).

### 5. Internet Archive (https://archive.org)
Hit-or-miss but contains some incredible historical nature recordings. Search "ambient" or "field recording" with `mediatype:audio`.
- Good for the more unusual scenes — e.g. spaceship hum (search NASA recordings), train interior, airplane cabin (search "ASMR airplane").

### 6. MyNoise (https://mynoise.net)
**Reference-only.** Stéphane Pigeon has built excellent calibrated soundscapes here over years. Can't directly download recordings, but it's the gold-standard reference for "what should this scene sound like" — especially the tinnitus-mask noise generators and the singing bowls / sound bath.

---

## Paid, at your $20–50 budget

### 7. ASoundEffect (https://www.asoundeffect.com)
Marketplace. Many packs in $20–50 range. Tag "ambience" or "nature" filters work well.
- Often runs sales — check the "deals" section.

### 8. Boom Library (https://www.boomlibrary.com)
Premium quality, used in films/games. Their nature packs (e.g. "Atmospheres", "Cinematic Voices Forests") are stunning but priced $50–200. Worth it for **one** scene you fall asleep to most.

### 9. Pro Sound Effects (https://www.prosoundeffects.com)
Higher-end. Stretch budget; consider after you've used Freesound to learn what you actually want.

### 10. SoundDogs (https://www.sounddogs.com)
Pay-per-effect (~$5–20 per file). Useful if you need ONE specific recording and don't want to buy a whole pack.

### 11. FreeToUseSounds (https://www.freetousesounds.com)
Mix of free and paid packs. Marc Steffen's recordings, often heavy on travel/transport ambiences (good for airplane cabin, train interior, car highway).

---

## Recording-specific tips for our scenes

| Scene | Search terms that work | Watch out for |
|---|---|---|
| Forest day | `forest ambience birds creek`, `woods morning` | Designed nature scenes with too-prominent birds — we want bed, not soloists |
| Forest night | `crickets owl ambience`, `night forest` | Coyote howls / dramatic owl calls — wakes the user |
| Waterfall | `waterfall close, mid, distant` | Avoid waterfalls so loud the high-frequency hiss dominates |
| Beach gentle | `waves lapping shore`, `gentle surf` | Crashing waves, gulls — those go in "heavy surf" |
| Rain on window | `rain window glass`, `cozy rain inside` | Thunder — separate scene |
| Rain on tent | `rain canvas tent`, `camping rain` | Wind that's too active |
| Rain on roof | `rain roof shingles`, `attic rain` | Dripping water close-up — too rhythmic, becomes a metronome |
| Fireplace | `fireplace crackle 10 min`, `wood burning` | Crackles too sharp or too sparse — needs steady pulse |
| Spaceship | `sci fi engine hum`, `Star Trek bridge` | Anything labeled "horror" or "Alien" — wrong vibe per brief |
| Airplane cabin | `airplane interior cruise 10 hour` | Departure/landing audio (announcements) |
| Sound bath | `Tibetan singing bowl`, `meditation drone` | New age music with chord changes — we want drone, not melody |

---

## What to skip

- **YouTube-to-MP3 rippers.** License situation is murky and audio quality is degraded.
- **Spotify/Apple Music sleep playlists.** Can't extract; not useful as source files.
- **AI-generated soundscapes** (Suno, ElevenLabs sound effects). Quality is improving but not there yet for hours-long ambience — and the brief specifies real field recordings.
- **Anything labeled "1 hour rain" YouTube videos.** These are usually loops of much shorter source recordings — same problem we're trying to solve.

---

## File handling once you've downloaded a recording

Save files as: `public/audio/<scene-id>/<element>/<variant>.<ext>`. For example:
```
public/audio/forest-day/wind/wind-leaves-1.mp3
public/audio/forest-day/wind/wind-leaves-2.mp3
public/audio/forest-day/creek/creek-trickle-1.mp3
```

Save license / attribution next to each file:
```
public/audio/forest-day/wind/wind-leaves-1.json
```
```json
{
  "source": "Freesound user 'soundbridge'",
  "url": "https://freesound.org/people/soundbridge/sounds/123456/",
  "license": "CC0",
  "downloadedAt": "2026-05-10",
  "trimmedTo": "240s",
  "notes": "Light gust pattern, no human voices"
}
```

When we get to Phase 2, the SceneDefinition JSON loader will reference these files and we can validate licenses before bundling.
