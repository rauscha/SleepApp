# Next steps — current project state

Last updated after: Phase 3 Tonight screen real UI

---

## Phase status

| Phase | Status | Summary |
|-------|--------|---------|
| 1 | ✅ Done | Audio engine — noise synth, FileLayer crossfade, tinnitus (shelved), storage |
| 2 | ✅ Done | Multi-layer scenes, coprime offsets, Surprise Me, Pixabay sources |
| 3 | 🔄 In progress | Tonight + Player screens; CI; A1 iOS fix shipped |
| 4 | 🔲 Not started | AI meditations (pre-generated) + AI sleep stories (on-demand) |
| 5 | 🔲 Not started | PWA manifest, iOS device testing, perf profiling |

---

## Phase 3 — remaining work (priority order)

### P3-1 ✅ Tonight screen — real House Blend cards
Scene cards with per-scene gradient backgrounds (placeholder for real photos),
descriptions from the scene index, primary card taller, Surprise me button.
Footer cleaned up. Loading skeleton.

### P3-2 ✅ Player screen — sleep timer chip
Timer chip in the Player header (top-right). Tap to open inline duration picker
(15 / 30 / 60 / 90 min). Countdown shows "28:47" while running; tapping cancels.
When countdown hits zero: `MasterBus.fadeToSilence(90)` fires a 90-second fade,
then scene stops and app returns to Tonight. Manual Stop during a fade cancels
the fade completion callback and restores master volume.

### P3-3 ✅ Nightstand mode
Full black screen (`fixed inset-0 bg-black`); tap anywhere reveals dim controls
(opacity-40) for 3s, then back to black. Auto-engages after 30s idle in Lush.
Controls show: scene name, timer countdown if running, Stop button, "Lush mode"
exit link. Timer firing while in Nightstand auto-wakes controls so the user
sees "Fading…". Manual "Nightstand mode" button at the bottom of the Lush layout.
Implemented via `useIdleTimer` and `useWakeTimer` hooks in PlayerScreen.tsx.

### P3-4 ✅ Settings screen
Reachable from "Settings" link in the Tonight footer. Sections:
- **Playback**: master volume slider (applies live to running engine), default
  sleep timer selector (Off/15/30/60/90 min). When a default is set, PlayerScreen
  auto-starts the timer on every scene launch.
- **AI features (coming soon)**: disabled ElevenLabs + Anthropic API key fields
  with explanatory note; layout is ready for Phase 4 wiring.
- **About**: v0.1.0, anti-tracking statement.

---

## Known bugs to fix (before Phase 4)

| ID | Severity | Fix cost | Summary |
|----|----------|----------|---------|
| A2 | Low | 30 min | `removeLayer` blocks on full crossfade duration when stopping — fix during scene transition work if it becomes noticeable |
| A3 | Very low | 2 min | Pink-noise normalization can momentarily clip (limiter catches it) — divide by 16 instead of 8 in worklet |
| A4 | Very low | 5 min | `dbPromise` caches a rejected IndexedDB promise forever — reset to `null` in rejection handler |

A1 (iOS FileLayer scheduler) ✅ fixed in commit e70dc49.

---

## Phase 4 — AI content ✅ Done

### Meditations — pre-generated, bundled ✅
- `tools/gen-meditation.ts` CLI: Claude writes script → ElevenLabs v3 synthesises →
  saves MP3 to `public/meditations/` + updates `index.json`.
- Run with: `ANTHROPIC_API_KEY=… ELEVEN_LABS_API_KEY=… npx tsx tools/gen-meditation.ts --title "…" --style body-scan --voice tide`
- Args: `--title`, `--style` (body-scan|breath-focus|visualization), `--voice` (tide|stone), `--id` (filename stem)
- `public/meditations/index.json` is the catalog. Commit it + the MP3s and rebuild.

### Library screen ✅
- Reachable from Tonight footer ("Library" link).
- Two tabs: Meditations (from `public/meditations/index.json`) and Stories (IndexedDB).
- Empty-state guidance for both tabs when no content exists.
- Stories tab has "Generate new story →" button + per-story delete.

### ContentPlayerScreen ✅
- Howler.js with `html5: true` for iOS background audio.
- Seekable progress bar, play/pause (▶/⏸/↺), duration display.
- Handles both direct URLs (meditations) and blob URLs (stories from IndexedDB).
- Blob URLs are revoked in App.tsx when leaving the player.

### Sleep stories — on-demand ✅
- Settings API key fields are now live (ElevenLabs + Anthropic), type=password with show/hide toggle.
- `src/services/storyGenerator.ts`: Claude writes 2800–3200 word script → ElevenLabs v3 → IndexedDB.
- `StoryGeneratorScreen`: theme input, voice picker (Hush/Ember/Glen), cost note, live step progress.
- Stories appear in Library → Stories tab; can be played or deleted.

### Voice IDs to update
The app ships with ElevenLabs premade voice IDs as stand-ins. Once custom voices are
created via Voice Design:
- Update `STORY_VOICE_IDS` in `src/services/storyGenerator.ts`
- Update `VOICE_IDS` in `tools/gen-meditation.ts`

---

## Phase 5 — polish (last)

- PWA `manifest.json` + 192/512/maskable icons (need icon art first).
- Service worker with audio-asset caching strategy (tricky — wrong cache
  policy = silent gap = The One Thing's worst failure mode).
- iOS Safari overnight device test: lock screen → 8 hours → no seam.
- Bundle lazy-loading: defer ElevenLabs/Anthropic SDKs to Settings/Library
  screens only (they'll add ~50+ kB when wired in).
- `prefers-reduced-motion`: disable CSS transitions globally.

---

## Open questions

1. **Photo assets** — House Blend cards use gradient placeholders for now.
   When do we source real photographs? Unsplash/Pexels CC0 would work for
   dev; need proper licensing for production.
2. **Howler for story playback (Phase 4)** — raw Web Audio for stories is
   overkill; Howler's iOS background hardening is worth it for long-form MP3
   playback. Still undecided.
3. **Variant pool minimum** — enforce ≥2 variants per element, or allow
   single-variant layers?
4. **Tinnitus revival** — weak evidence base + UX issues shelved it. Skip
   entirely in v1 or find a simpler entry point?
