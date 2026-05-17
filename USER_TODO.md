# Your TODO list — things only you can do

Tasks the project needs from you (assets, decisions, physical-device tests).
Each item has just enough info to act on without re-reading the rest of the
docs. When you finish one, tick the checkbox.

---

## TTS / AI content — status

- **Meditations** — ✅ 3 shipped (commit 7e46293, 2026-05-14): body-scan-01,
  breath-01, forest-01. Library → Meditations tab populated. Voices still
  point at ElevenLabs premades — custom Voice Design pending (see below).
- **Sleep stories** — generated in-browser by the user, saved to IndexedDB.
  Nothing pre-bundled. Smoke test still TODO (see below).

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

- [x] **Forest, midday** — `public/scenes/photos/forest-day.jpg` (110 KB)
- [x] **Rain on the window** — `public/scenes/photos/rain-on-window.jpg` (174 KB)
- [x] **Fireplace** — `public/scenes/photos/fireplace.jpg` (143 KB)

`TonightScreen.tsx` now layers a top→bottom dark gradient over each photo
(see `PHOTO_OVERLAY`); scenes without a photo entry fall back to the
original `SCENE_GRADIENTS`.

### Photos for future scenes
Raw originals already sit in untracked `ACR-photos/` for:
**Forest at night, waterfall, beach (×2), plane cabin, rain on roof,
spaceship, calm, rain-2 (TIF — won't render, needs conversion)**.

When the matching scene JSON lands, run the same ffmpeg pipeline:

```
ffmpeg -y -i ACR-photos/<source> -vf "scale=1200:-1:flags=lanczos" \
       -q:v 4 public/scenes/photos/<scene-id>.jpg
```

Then add the entry to `SCENE_PHOTOS` in `TonightScreen.tsx`.

### Source convention
- 1200px wide, JPEG q80 (≈4 in ffmpeg `-q:v` scale), <250 kB target
- Raw originals stay in `ACR-photos/` (gitignored)
- Processed outputs go to `public/scenes/photos/<scene-id>.jpg` and DO get committed

---

## Install on your iPhone (PWA) — ← **do this next**

The build is install-ready: PNG icons (192/512/maskable/180), full manifest
with `categories: ["health","lifestyle"]`, `display: "standalone"`, dark
theme/background, service worker precaches the app shell + hashed JS/CSS so
the app loads from the home screen with no network.

### One-time setup on the desktop
1. From the SleepApp directory:
   ```
   npm run build
   npm run preview     # serves dist/ on https://<host>:4173
   ```
   (HTTPS comes from `@vitejs/plugin-basic-ssl` — self-signed cert, fine for
   a single user on LAN. iOS Add-to-Home-Screen requires HTTPS; that's why
   we're not just using `npm run dev` over plain http.)
2. Find your machine's LAN IP or hostname. Examples:
   - `https://crane-desk:4173/`
   - `https://crane-desk.saiga-wage.ts.net/` if you have `tailscale serve
     --bg --https=443 http://localhost:4173` running (recommended — real
     cert, no warning, works off-LAN too).
   - `https://192.168.x.x:4173/` LAN IP fallback.

### On the iPhone
1. Make sure the phone is on the same Wi-Fi as the desktop (or has Tailscale
   active if you're using the tailnet URL).
2. Open **Safari** (not Chrome — only Safari can install PWAs on iOS).
3. Go to the URL from step 2.
4. **Cert warning** (only if you used the basic-ssl URL, not Tailscale):
   tap "Show Details" → "visit this website" → "Visit Website" → enter
   passcode if asked. iOS remembers per-host after that.
5. App loads. Take a moment to verify a scene starts — that primes the
   audio cache.
6. Tap the **Share button** (square + up arrow at the bottom).
7. Scroll the action sheet → **Add to Home Screen** → tap **Add** (top right).
8. The Sleep icon (sage crescent on ink) appears on the home screen. Tap
   it — opens full-screen, no Safari chrome, status bar dark.

### What to expect after install
- Airplane mode → opening from the home screen still loads the app shell
  (network-first nav, falls back to cached `/`).
- Scenes you've previously played load instantly from cache; new ones need
  network on first play.
- Updates: the SW deliberately does **not** `skipWaiting()` — a new build
  activates on the next cold launch, never mid-session. So nightly updates
  won't interrupt a running scene.

- [ ] **Final icon art.** Current PNGs are placeholders (sage crescent on
  ink, no typography). When a real brand mark lands, regenerate via
  `node tools/gen-icons.mjs` (edit the script's BG/FG/geometry) or replace
  the four files in `public/icons/` directly — manifest paths and the
  apple-touch link in `index.html` stay as they are.

---

## ElevenLabs Voice Design — custom voices  ← **tomorrow's focus (2026-05-15)**

The app ships with ElevenLabs premade voice IDs as stand-ins. To replace
with custom voices designed in the ElevenLabs Voice Design portal:

- [ ] **Story voices** (3): Hush, Ember, Glen. Design + save voice IDs.
  Update `STORY_VOICE_IDS` in `src/services/storyGenerator.ts:24-28`.
- [ ] **Meditation voices** (2): Tide, Stone. Design + save voice IDs.
  Update `MEDITATION_VOICE_IDS` in `src/services/storyGenerator.ts:30-33`
  AND `VOICE_IDS` in `tools/gen-meditation.ts`.

Once new IDs are in place, **regenerate the 3 shipped meditations** with
the same `tools/gen-meditation.ts` invocations as before — they'll
overwrite by `--id` and the index.json entry will refresh in place.

Cost note: Voice Design is included in ElevenLabs paid tiers. Each design
session burns a few credits but the resulting voice is reusable forever.

---

## Generate meditations — ✅ done (commit 7e46293, 2026-05-14)

- [x] **Body scan** — `body-scan-01.mp3`, Tide voice, 8:13
- [x] **Breath focus** — `breath-01.mp3`, Stone voice, 8:02
- [x] **Visualization (forest path)** — `forest-01.mp3`, Tide voice, 8:50

When custom Voice Design voices land, rerun the same CLI invocations
to regenerate with the new voices (the CLI overwrites by `--id`):

```
$env:ELEVEN_LABS_API_KEY = (Get-Content elevenlabs.txt -Raw).Trim()
npx tsx tools/gen-meditation.ts --title "Slow body scan" --style body-scan --voice tide --id body-scan-01
npx tsx tools/gen-meditation.ts --title "Breath focus"   --style breath-focus --voice stone --id breath-01
npx tsx tools/gen-meditation.ts --title "Forest path"    --style visualization --voice tide --id forest-01
```

---

## Generate one sleep story to verify the flow

- [ ] Open the app → Library → "Generate new story →" → enter a theme
  (e.g. "a winter cabin"), pick a voice, tap Generate. Wait 2–5 min.
  Verify it appears in Library → Stories and plays back end to end.

(Stories live in IndexedDB per-browser, so this is a smoke test, not
content to ship.)

---

## Overnight device tests (Phase 5)  ← **iOS + Android in parallel tonight 2026-05-15**

Last night: Android crashed at ~10 min. iOS test result still pending
from wife's iPhone. Tonight: run both phones in parallel against the
same dev server. MediaSession metadata + lifecycle log are now in place
(this morning's commit), so if Android crashes again the log will tell
us why.

Setup (per phone, once):
- [ ] Visit `https://crane-desk:5173/` (or LAN IP), tap through the
  self-signed cert warning, install as PWA if you want home-screen.
- [ ] Pick a scene, no timer, lock the phone, leave 8+ hours.

In the morning:
- [ ] Listen for seams / fade-to-silence / stutter / "audio just stopped".
- [ ] In each phone's app: Settings → Diagnostics → **Share** (or Copy /
  Download). Capture the log even if the night went fine — a clean
  log is also useful baseline.
- [ ] If Android crashed again, look at the log for `freeze` events
  near the crash time. If `freeze` fires before the tab dies, the next
  fix is Wake Lock (see NEXT_STEPS P5-9).

Coverage suggestion: run different scenes on each phone to exercise
both the FileLayer pipeline (ambient scenes) and Howler/ContentPlayer
(a meditation) in one night.

---

## Decisions still open (your call)

- [ ] **Tinnitus features** — currently shelved. Skip entirely in v1, or
  revive with a simpler entry point? See `DECISIONS.md` for the original
  shelving rationale.
- [ ] **Friends build** — anything you eventually want to share needs
  CC0-only audio (BBC RemArc license forbids redistribution). Worth
  thinking about now if it changes which sources you pick.
