# Your TODO list — things only you can do

Tasks the project needs from you (assets, decisions, physical-device tests).
Each item has just enough info to act on without re-reading the rest of the
docs. When you finish one, tick the checkbox.

---

## TTS / AI content — status

**Both pipelines are wired, but neither has shipped content yet.**

- **Meditations** — `public/meditations/index.json` is `{"meditations":[]}`.
  No meditations have been generated. The CLI (`tools/gen-meditation.ts`)
  is ready; nothing has been run.
- **Sleep stories** — generated in-browser by the user, saved to IndexedDB.
  Nothing pre-bundled. Each user-browser starts empty.

So to clarify: the engine, the UI, the prompts, the voice mappings are all
in place. The content itself does not exist. See "Generate meditations" and
"Generate one sleep story to verify the flow" below.

---

## Audio — variant gaps

The scene crossfade rotates between variants per element. With only one
variant the rotation pool is degenerate (same buffer played repeatedly with
different start offsets). Recommended minimum: **2 variants per element**,
ideally 3.

Current state (5 of 8 elements are single-variant):

### `public/audio/fireplace/`
- [ ] `fire-close/` — has `close-1.mp3`. **Need:** `close-2.mp3` (and ideally `close-3.mp3`)
- [ ] `fire-distant/` — has `distant-1.mp3`. **Need:** `distant-2.mp3`

### `public/audio/forest-day/`
- [ ] `wind-in-leaves/` — has `wind-1.mp3`. **Need:** `wind-2.mp3`
- [ ] `creek-trickle/` — has `creek-1.mp3`. **Need:** `creek-2.mp3`
- [x] `distant-birds/` — 2 variants (`birds-1`, `birds-2`). OK.

### `public/audio/rain-on-window/`
- [x] `rain-on-glass/` — 2 variants. OK.
- [x] `distant-thunder-rumble/` — 2 variants. OK.
- [ ] `rain-pavement/` — has `pavement-1.mp3`. **Need:** `pavement-2.mp3`

### Acquisition guide
See `AUDIO_SOURCES.md` for source libraries (Freesound, Pixabay, BBC,
George Vlad). Format conventions and the per-file license JSON are at the
bottom of that doc. Each new variant needs:
- `<variant>.mp3` — 44.1 or 48 kHz, stereo, 4+ minutes
- `<variant>.json` — license sidecar (see existing sidecars for shape)
- An entry added to the scene's `public/scenes/<scene>.json` under the
  matching element's `variants` array

### New scenes (optional, brief mentions but not yet in)
Brief lists more scenes than currently shipped (forest night, waterfall,
beach gentle, rain on tent, rain on roof, spaceship, airplane cabin,
sound bath). Adding any of these is one new file under
`public/scenes/` + audio files + an entry in `public/scenes/index.json`.

---

## Photos — for House Blend cards

`TonightScreen.tsx` currently renders each scene card with a gradient
placeholder (see `SCENE_GRADIENTS` at the top of the file). When real
photos land, swap the inline `style={{ background: gradient }}` for an
`<img>` or `background-image`.

**Photos needed (one per shipped scene):**

- [ ] **Forest, midday** — soft canopy light filtering down, no people,
  no sharp focal point. Greens/golds. Mood: stillness, deep. Avoid:
  hiking-trail vibe, anything with a horizon line that reads as "go
  somewhere."
- [ ] **Rain on the window** — close-up wet glass with bokeh behind. Cool
  blue / blue-grey. Avoid: stormy drama, lightning, anything that says
  "tense weather event."
- [ ] **Fireplace** — close, low-key, warm. Embers + soft flame, not a
  roaring blaze. Warm orange/amber. Avoid: holiday/Christmas decor,
  stockings, anything seasonal.

### Format
- Portrait-oriented works best for the card layout (cards are tall on mobile)
- 1080×1620 (2:3) or 1200×1600 at minimum
- JPEG quality 80–85, save as `public/scenes/photos/<scene-id>.jpg`
- A second `<scene-id>@2x.jpg` for retina would be ideal but not required
- Goal file size: <250 kB each so initial paint isn't penalised

### Source options
- **Your own Lightroom catalog** is the best option — you mentioned you
  shoot photography. Anything moody and quiet from your archive likely fits.
- **Unsplash / Pexels** (CC0) — fine for dev; if you intend to share the
  build with anyone, your own photos remove all licensing ambiguity.

---

## PWA icon — replace placeholder

The app ships an SVG placeholder at `public/icons/icon.svg` (sage crescent
on ink background). It satisfies the manifest and renders fine on Android
home screens. Two limitations worth knowing:

- iOS Safari prefers raster apple-touch-icon. Older iOS versions may show
  a generic glyph until you provide PNGs.
- The current art has no typography or photography — it's a Phase 5
  scaffold, not a real brand mark.

- [ ] **Final icon art.** When ready, output:
  - `public/icons/icon-192.png` (192×192)
  - `public/icons/icon-512.png` (512×512)
  - `public/icons/icon-maskable-512.png` (512×512, art inside inner 80%)
  - `public/icons/apple-touch-icon.png` (180×180, no transparency)
  Then update `public/manifest.json` `icons[]` and `index.html`'s
  `<link rel="apple-touch-icon">` to point at the PNGs.

---

## ElevenLabs Voice Design — custom voices

The app ships with ElevenLabs premade voice IDs as stand-ins. To replace
with custom voices designed in the ElevenLabs Voice Design portal:

- [ ] **Story voices** (3): Hush, Ember, Glen. Design + save voice IDs.
  Update `STORY_VOICE_IDS` in `src/services/storyGenerator.ts:24-28`.
- [ ] **Meditation voices** (2): Tide, Stone. Design + save voice IDs.
  Update `MEDITATION_VOICE_IDS` in `src/services/storyGenerator.ts:30-33`
  AND `VOICE_IDS` in `tools/gen-meditation.ts`.

Cost note: Voice Design is included in ElevenLabs paid tiers. Each design
session burns a few credits but the resulting voice is reusable forever.

---

## Generate meditations (one-time, ~$5–15 total)

Once your ElevenLabs key is set, generate a starter set so the Library →
Meditations tab isn't empty on launch.

- [ ] **Body scan, ~10 min**
  ```
  ANTHROPIC_API_KEY=… ELEVEN_LABS_API_KEY=… \
    npx tsx tools/gen-meditation.ts \
    --title "Slow body scan" --style body-scan --voice tide --id body-scan-01
  ```
- [ ] **Breath focus, ~8 min** — `--style breath-focus --voice stone --id breath-01`
- [ ] **Visualization (forest path), ~12 min** — `--style visualization --voice tide --id forest-01`

Each one outputs an MP3 + an entry in `public/meditations/index.json`.
Commit the JSON + the MP3s.

---

## Generate one sleep story to verify the flow

- [ ] Open the app → Library → "Generate new story →" → enter a theme
  (e.g. "a winter cabin"), pick a voice, tap Generate. Wait 2–5 min.
  Verify it appears in Library → Stories and plays back end to end.

(Stories live in IndexedDB per-browser, so this is a smoke test, not
content to ship.)

---

## iOS device overnight test (Phase 5)

- [ ] Install the app as a PWA on your iPhone (once Phase 5 PWA manifest
  ships).
- [ ] Pick a scene, set a no-timer playback, lock the phone, leave it
  overnight (8+ hours).
- [ ] At wake: listen for any seam, fade-to-silence, or stutter. Note
  what scene + what time the issue happened (if any).

This is the only way to verify the iOS Safari setTimeout-throttling fix
in production conditions.

---

## Decisions still open (your call)

- [ ] **Tinnitus features** — currently shelved. Skip entirely in v1, or
  revive with a simpler entry point? See `DECISIONS.md` for the original
  shelving rationale.
- [ ] **Friends build** — anything you eventually want to share needs
  CC0-only audio (BBC RemArc license forbids redistribution). Worth
  thinking about now if it changes which sources you pick.
