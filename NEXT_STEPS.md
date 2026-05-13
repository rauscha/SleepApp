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

### P3-4 Settings screen
Reachable from Tonight footer. Knobs: master volume (redundant with Player but
useful here), sleep timer default duration, about/version line.
Placeholder API key fields (ElevenLabs, Anthropic) for Phase 4 — render them
as `disabled` inputs with "Coming in a future update" hint.

---

## Known bugs to fix (before Phase 4)

| ID | Severity | Fix cost | Summary |
|----|----------|----------|---------|
| A2 | Low | 30 min | `removeLayer` blocks on full crossfade duration when stopping — fix during scene transition work if it becomes noticeable |
| A3 | Very low | 2 min | Pink-noise normalization can momentarily clip (limiter catches it) — divide by 16 instead of 8 in worklet |
| A4 | Very low | 5 min | `dbPromise` caches a rejected IndexedDB promise forever — reset to `null` in rejection handler |

A1 (iOS FileLayer scheduler) ✅ fixed in commit e70dc49.

---

## Phase 4 — AI content (after Phase 3 is solid)

### Meditations — pre-generated, bundled
- Build `tools/gen-meditations.ts` CLI: Claude writes script → ElevenLabs v3
  synthesises → saves MP3 + metadata JSON under `public/meditations/`.
- Run on your machine once; files ship with the app. Zero per-user cost.
- Design the Claude prompt first: body-scan or breath-focus arc, 10–15 min,
  deliberately dull, `[softly]` / `[pause]` ElevenLabs markers.

### Sleep stories — on-demand, user's own API keys
- Settings paste fields: ElevenLabs key + Anthropic key → stored in
  localStorage (never leaves the device).
- Story flow: Claude script (~3000 words, $0.05–0.10) → ElevenLabs v3 audio
  (~$1–3, the dominant cost) → IndexedDB storage.
- Regenerate UI surfaces cost warning ("~$2 to regenerate").
- Generation can take 60+ seconds — run in a background tab; show progress.

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
