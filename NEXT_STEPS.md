# Next steps — current project state

Last updated: 2026-05-15 PM. Android overnight test crashed at ~10 min last night; iOS test result still pending from wife's iPhone. Earlier today: MediaSession metadata + persistent lifecycle log shipped. This session: hardened the story generator pre-smoke-test — pulled title/duration/id derivation out as pure functions, replaced the fragile script-regex title heuristic with a theme-based title, added 21 unit tests.

**Next session priorities (still 2026-05-15):**
1. Voice design — design 5 custom ElevenLabs voices (Hush, Ember, Glen, Tide, Stone), wire IDs, regenerate the 3 meditations. See `USER_TODO.md` § "ElevenLabs Voice Design". (In-flight in branch `claude/hungry-tesla-a1926e`.)
2. Collect iOS overnight result.
3. Sleep-stories smoke test (still open).

**Tonight's run:** iOS + Android in parallel against the same dev server. After wake, Settings → Diagnostics → Share to dump each phone's lifecycle log. If Android still crashes, the log will show whether the tab was frozen/discarded vs. some other failure — Wake Lock is the next lever to pull if so.

---

## Phase status

| Phase | Status | Summary |
|-------|--------|---------|
| 1 | ✅ Done | Audio engine — noise synth, FileLayer crossfade, tinnitus (shelved), storage |
| 2 | ✅ Done | Multi-layer scenes, coprime offsets, Surprise Me, Pixabay sources |
| 3 | ✅ Done | Tonight + Player + Nightstand + Settings; CI; A1 iOS fix shipped |
| 4 | ✅ Done | AI meditations (CLI pipeline) + AI sleep stories (on-demand in-app). Starter set of 3 meditations shipped — body-scan/breath-focus/visualization. |
| 5 | 🔄 In progress | Polish — lazy-loading ✅, reduced-motion ✅, manifest ✅, service worker ✅, scene photos ✅, HTTPS dev server ✅, iOS overnight test 🔄 running tonight |

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

### P5-3 ✅ PWA manifest + icons
`public/manifest.json` shipped with name/short_name, dark theme/background,
portrait-standalone display. SVG icon at `/icons/icon.svg` works as both
`purpose: any` and `purpose: maskable` (artwork sits in the inner 60% so
the maskable mask doesn't crop it). Linked from `index.html` as both
`<link rel="manifest">` and `<link rel="apple-touch-icon">`.

The icon is a placeholder — sage crescent on ink-950, no typography. Swap
for bitmap PNG art once a final design lands (USER_TODO entry).

### P5-4 ✅ Service worker — audio asset caching
`public/sw.js` shipped. Strategy:
- `/audio/**`, `/worklets/**`, `/meditations/**` — **cache-first** (audio is
  immutable per file; once cached, never re-fetch unless evicted)
- `/scenes/**` — **stale-while-revalidate** (config JSON; serve cached, refresh
  in background)
- HTML navigations — **network-first** with cache fallback (so app updates
  arrive, but offline still loads)
- Hashed JS/CSS — **stale-while-revalidate**

Safety choices to avoid the silent-gap failure mode:
- `skipWaiting()` is deliberately **not** called. A new worker waits until
  the next cold start — running audio sessions are never disturbed.
- `cacheFirst` only stores status === 200 (rejects 206 partial-content so
  range requests can't poison the cache with truncated buffers).
- Register only in `import.meta.env.PROD` — dev's `/src/*` paths would
  pollute the cache and HMR doesn't compose with SW interception.

### P5-5 iOS device test (overnight) — 🔄 running 2026-05-14 → 2026-05-15
Wife is running the test on her iPhone tonight. Result + any seam/
fade-to-silence reports expected in the AM. With the SW in place this
also exercises offline behaviour (airplane-mode mid-night should keep
audio running from cache). See `USER_TODO.md`.

### P5-6 ✅ HTTPS dev server (basic-ssl)
`@vitejs/plugin-basic-ssl` ships a self-signed cert so the dev + preview
servers are reachable over HTTPS from phones on the LAN — required
because AudioWorklet (and other secure-context-only Web APIs) refuse
plain HTTP unless served from `localhost`. Phone hits
`https://crane-desk:5173/` or LAN-IP equivalent, taps through the cert
warning once, AudioWorklet loads. Commit 133108e.

### P5-7 Scene photos for shipped scenes — ✅
Forest, Rain, Fireplace photos shipped (commit 7e46293). Layered
under a top→bottom dark gradient (`PHOTO_OVERLAY`) in `TonightScreen.tsx`
so text stays legible on bright frames. Raw originals + 9 future-scene
photos sit in untracked `ACR-photos/`.

### P5-8 MediaSession + lifecycle log — ✅ (this session)
`navigator.mediaSession.metadata` is now set whenever a scene starts
(`src/audio/mediaSession.ts`, wired in `PlayerScreen.tsx`). The OS-level
"this tab is a media session" signal raises the tab's priority against
Chrome's background-discard heuristic on Android and surfaces the scene
name on the lock screen.

`src/diagnostics/lifecycleLog.ts` captures visibilitychange / freeze /
resume / pagehide / pageshow / error / unhandled-rejection events plus
audio-state transitions and scene start/stop. Persisted to localStorage
(cap 500 entries, FIFO). Settings → Diagnostics surfaces the log with
Share / Copy / Download / Clear buttons. Web Share API used on devices
that support it, clipboard fallback otherwise.

### P5-9 Wake Lock — held until tonight's data lands 🔲
If tonight's lifecycle log shows the Android tab still being frozen at
~10 min despite MediaSession, the next lever is `screen.wakeLock`. Held
back for now because it has real battery cost and a faint conflict with
the "no demands on the user" design (phone has to be plugged in to be
useful with a wake lock).

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

1. ~~**Photo assets**~~ — **resolved for the 3 shipped scenes.** Forest,
   Rain, Fireplace photos live at `public/scenes/photos/<id>.jpg` and
   render under a dark overlay gradient in `TonightScreen.tsx`. Raw
   sources stay in untracked `ACR-photos/`. Photos for any future scenes
   (waterfall, beach, forest-night, etc.) still TODO.
2. **Variant pool minimum** — five of eight scene elements ship with only
   one variant. Crossfade still works (same-buffer rotation), but the
   rotation pool isn't doing useful work yet. See `USER_TODO.md` for
   the per-element gap list.
3. **Tinnitus revival** — weak evidence base + UX issues shelved it. Skip
   entirely in v1 or find a simpler entry point?
4. ~~**Howler for story playback**~~ — **resolved.** Phase 4 wired Howler
   in for ContentPlayer (iOS background audio + streaming). Phase 5 just
   moved it to a lazy chunk. No further decision needed.
