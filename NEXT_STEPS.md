# Next steps — current project state

Last updated after: Phase 5 quick-wins (lazy-loading, doc sync)

---

## Phase status

| Phase | Status | Summary |
|-------|--------|---------|
| 1 | ✅ Done | Audio engine — noise synth, FileLayer crossfade, tinnitus (shelved), storage |
| 2 | ✅ Done | Multi-layer scenes, coprime offsets, Surprise Me, Pixabay sources |
| 3 | ✅ Done | Tonight + Player + Nightstand + Settings; CI; A1 iOS fix shipped |
| 4 | ✅ Done | AI meditations (CLI pipeline) + AI sleep stories (on-demand in-app) |
| 5 | 🔄 In progress | Polish — lazy-loading ✅, reduced-motion ✅, PWA/iOS test/perf next |

---

## Phase 5 — remaining work (priority order)

### P5-1 ✅ Bundle lazy-loading
Post-Tonight screens (Settings, Library, ContentPlayer, StoryGenerator) are
loaded via `React.lazy()` + `<Suspense>`. Howler (used only in
ContentPlayer) is now in a 39 kB side chunk instead of the main bundle.
Initial JS dropped from ~247 kB → 192 kB. Fallback is a silent dark screen
(no spinner, no flash) so a cold-cache load at 2am stays dark.

### P5-2 ✅ `prefers-reduced-motion` global CSS
Implemented in `src/index.css` lines 70–78. Disables animations and
transitions when the OS asks; audio scheduling is untouched.

### P5-3 PWA manifest + icons (blocked on icon art)
`manifest.json` with 192/512/maskable icons. Service worker registration.
**Blocked on:** icon art from user. See `USER_TODO.md`.

### P5-4 Service worker — audio asset caching
Cache `/audio/**` and `/scenes/**` aggressively (immutable hashed names).
HTML/JS/CSS use stale-while-revalidate. The risk: wrong cache policy means
a silent gap mid-night — the One Thing's worst failure mode. Plan caching
strategy before writing code; ideally test on a throttled connection first.

### P5-5 iOS device test (overnight)
Lock the phone, run 8 hours, listen at wake for any seam or fade-to-silence.
Needs physical device. See `USER_TODO.md`.

---

## Known bugs

| ID | Status | Notes |
|----|--------|-------|
| A1 | ✅ fixed | iOS FileLayer scheduler — commit e70dc49 |
| A2 | 🔲 open (low) | `removeLayer` blocks on full crossfade when stopping — 30 min fix during scene transition work if it becomes noticeable |
| A3 | ✅ fixed | Pink-noise divides by 16 + hard clamp (noise-processor.js:86–89) |
| A4 | ✅ fixed | `dbPromise` drops cached promise on rejection (assets.ts:44–46) |

---

## Open questions

1. **Photo assets** — House Blend cards still use gradient placeholders.
   See `USER_TODO.md` for the photo brief.
2. **Variant pool minimum** — five of eight scene elements ship with only
   one variant. Crossfade still works (same-buffer rotation), but the
   rotation pool isn't doing useful work yet. See `USER_TODO.md` for
   the per-element gap list.
3. **Tinnitus revival** — weak evidence base + UX issues shelved it. Skip
   entirely in v1 or find a simpler entry point?
4. ~~**Howler for story playback**~~ — **resolved.** Phase 4 wired Howler
   in for ContentPlayer (iOS background audio + streaming). Phase 5 just
   moved it to a lazy chunk. No further decision needed.
