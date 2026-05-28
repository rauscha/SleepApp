# Next steps — current project state

Last updated: 2026-05-27 PM. Offline-readiness batch complete; deploy
to GitHub Pages is the next user-driven step.

## 2026-05-26 batch (shipped)

Goal: make the app fully usable on Android + desktop with no network
after install (story generation excepted). iOS work is explicitly
deferred — "me-first" app, revisit deploy once everything else works.
Target deploy: GitHub Pages at `andrewrausch.com/SleepApp/`
(andrewrausch.com is the user's GH Pages user site).

1. **Self-host Inter font** (b311799) — Inter Variable
   (`public/fonts/InterVariable.woff2`, 352 KB) replaces the rsms.me
   stylesheet link. CSP `style-src` / `font-src` tightened to drop the
   rsms.me origin entirely. `<link rel="preload">` added so the font is
   in flight while CSS parses (no FOUT). Added to SW install-time
   precache list so first offline launch already has Inter.
2. **"Download for offline" button** on Settings (ad94c57) — new
   "Offline" section between Playback and AI features. Walks the asset
   graph (scene index → scene defs → variant URLs, plus the meditation
   + bundled-story indexes, plus the worklet and self-hosted font) and
   pulls each URL through `fetch()`. The SW intercepts the fetches and
   caches them via its existing cache-first / SWR routes — no cache
   names duplicated in the page. Idempotent: per-URL `caches.match()`
   skips files already cached, so re-tap is a no-op. Cancellable mid-
   download. Disabled in dev (no SW controller). Size warning ("about
   290 MB total") inline above the button.
3. **GH Pages deploy prep** (this commit) — vite gets
   `base: '/SleepApp/'`; the SW precache plugin now reads the resolved
   base from `configResolved` and prefixes every shell URL with it (no
   double-hardcoded prefix). `public/sw.js` derives `BASE` once at
   startup from `self.registration.scope` and matches `${BASE}audio/`
   etc., so the same file works under any deploy base. SW registration
   in `src/main.tsx` switched to `${import.meta.env.BASE_URL}sw.js`.
   `index.html` uses `%BASE_URL%` placeholders for the manifest, icon,
   apple-touch-icon, and font-preload hrefs (Vite only auto-rewrites a
   known set of HTML attributes; ad-hoc `<link>` hrefs aren't on it).
   CSP `connect-src` widened with `https://api.elevenlabs.io` and
   `https://api.anthropic.com` — latent bug fix: in-app story/meditation
   generation was CSP-blocked in prod, only the CLI worked because
   Node bypasses CSP. `public/manifest.json` uses relative paths
   (`./`, `./icons/...`) so it resolves correctly at any base — GH
   Pages serves it as a static file with no Vite substitution.
   `resolvePublicUrl` lifted to `src/lib/baseUrl.ts` and re-used from
   `sceneRegistry.ts` + `offlinePrecache.ts`.

81/81 tests pass, typecheck clean, build clean. Verified at the HTTP
level via `npm run preview` (`/SleepApp/` → 200, `/SleepApp/sw.js` →
200, `/SleepApp/fonts/InterVariable.woff2` → 200, manifest + icons +
scenes/index.json all 200). In-browser DevTools smoke test still
deserves a manual run before the public push.

**Next session priorities:**
1. **Live offline-mode verification on Android** — load the preview
   over the tailnet host on the phone, tap Settings → "Download for
   offline", wait for the progress bar to complete, switch the device
   to airplane mode, and confirm scene + meditation + bundled story
   all play. This is the first end-to-end check that the SW cache
   actually survives a network-loss event in the wild.
2. **Public repo push + GH Pages enable** — push the repo to
   `github.com/<user>/SleepApp` (new public repo), turn on Pages from
   the main branch, confirm it serves at `andrewrausch.com/SleepApp/`.
   The repo is safe to make public — API keys are user-supplied at
   runtime via localStorage, nothing baked into the bundle. A GH
   Actions deploy workflow is a future polish; manual `npm run build`
   + copying `dist/` works for the first cut.
3. **Bug A5 follow-up** — ElevenLabs Projects 405 still open. With the
   in-app path no longer CSP-blocked, a real prod call will tell us
   whether the API endpoint shape changed or just our request was
   wrong.
4. **Android overnight retest** — still pending; the offline-cache
   work above is the prerequisite, since we want to test scene
   playback without depending on the dev server staying reachable
   from the phone all night.

---

## 2026-05-18 batch (shipped)

Five-commit batch shipped overnight:

1. **Scene-config fix + meditation script-editing flow** (d7da552) — the
   FileLayer guard `buffer.duration ≥ loopOffsetSeconds + crossfadeSeconds`
   was failing on two scenes: fireplace's `fire-distant/distant-3` (240s
   vs 414s needed, 174s short) and rain-on-window's
   `rain-pavement/pavement-2` (525s vs 526s needed, 1s short). distant-3
   removed from variant rotation; rain-pavement loopOffset lowered
   521 → 515. Also: `tools/gen-meditation.ts` now writes a sidecar
   `<id>.txt` of the raw Claude script next to every MP3 and accepts
   `--script <path>` to re-render from a hand-edited script (no Claude
   call). Voice IDs now read from `VITE_VOICE_HUSH/EMBER/GLEN` env vars
   to stay in sync with the browser bundle.
2. **Regenerated 3 starter meditations on the new portal voices**
   (1f577e8) — all 3 starters were on the previous voice IDs even after
   the env vars updated. Regenerated with a remapped pairing: body-scan
   on hush, breath-focus on ember, visualization on glen (previously
   hush / glen / ember). Each meditation now ships with a sibling .txt
   for the hand-edit-and-re-render flow.
3. **Bundle infrastructure for shipped sleep stories** (a9d74cd) —
   adds `BundledStoryMetadata` type, `fetchBundledStoryIndex()` in
   LibraryScreen, and a new `tools/gen-story.ts` CLI mirroring
   `gen-meditation.ts` (Claude → ElevenLabs Projects or chunked-TTS
   fallback → MP3 + .txt sidecar in `public/stories/`). Bundled stories
   render in the Stories tab above user-generated ones, no delete
   button.
4. **2 baked sleep stories** (92813cb) — "Seaside village" (Tide voice,
   ~21 min, ~2700 words) and "Night train" (Stone voice, ~21 min, ~2700
   words). Projects API returned 405 Method Not Allowed both times —
   chunked-TTS fallback handled it. Service worker updated:
   `/stories/*.mp3` is cache-first under the existing AUDIO_CACHE bucket
   (no CACHE_VERSION bump — additive path), `/stories/index.json`
   gets stale-while-revalidate.
5. **forest-night scene** (c02c324) — second forest variant, reuses
   forest-day's wind + creek elements (no birds, quieter), paired with
   a new "Forest at night" photo from `ACR-photos/`. Same coprime
   offsets (251 / 521) as forest-day.

81/81 tests pass. Bundle size grew by ~34 MB (the two bundled stories);
public/audio is unchanged at 238 MB.

Live playback verification (meditations on new voices, bundled stories,
forest-night seam at 521 s) and the script-polish loop
(`npx tsx tools/gen-{meditation,story}.ts --id <id> --script ...`) are
still untested — fold them into the next on-device session above.

---

## Phase status

| Phase | Status | Summary |
|-------|--------|---------|
| 1 | ✅ Done | Audio engine — noise synth, FileLayer crossfade, tinnitus (shelved), storage |
| 2 | ✅ Done | Multi-layer scenes, coprime offsets, Surprise Me, Pixabay sources |
| 3 | ✅ Done | Tonight + Player + Nightstand + Settings; CI; A1 iOS fix shipped |
| 4 | ✅ Done | AI meditations (CLI pipeline) + AI sleep stories (on-demand in-app + 2 bundled). Starter set now: 3 meditations (body-scan/breath-focus/visualization) + 2 stories (Seaside village / Night train). |
| 5 | 🔄 In progress | Polish — lazy-loading ✅, reduced-motion ✅, manifest ✅, service worker ✅, scene photos ✅ (3 of 4 scenes), HTTPS dev server ✅, keep-alive stack ✅, iOS overnight test 🔄, Android overnight retest 🔄 |

---

## Future scenes — audio gap

`ACR-photos/` has raw originals for 8 scenes that aren't shipped yet
(waterfall, beach ×2, plane cabin, rain on roof, spaceship, calm,
rain-2). None of them have source audio in `raw-sounds/`. Shipping the
photos without audio is empty bundle weight, so they stay untracked
until their audio lands.

The one realistic next-scene candidate from current assets is
`raw-sounds/freesound_community-trainride-inside-recording-53564.mp3`
(717s, ~12 min). Deliberately not shipped as a single-element scene —
the brief's ≥2-variants-per-element target gives a noticeably better
listen than 1-variant loops, and the new Night train *story* already
covers that theme in the Library tab.

To add any of the future scenes:

1. Source 2+ loop-friendly variants per element from Freesound or
   Pixabay. Drop into `raw-sounds/`.
2. Extend `tools/process-raw-sounds.sh` with `process` calls for the
   new scene (see existing entries — pick durations that exceed
   intended loopOffset+crossfade).
3. Re-run the script. Outputs land in `public/audio/<scene>/<element>/`.
4. Create `public/scenes/<scene>.json` + add to `public/scenes/index.json`.
5. ffmpeg the matching photo from `ACR-photos/` to
   `public/scenes/photos/<scene>.jpg`. Add to `SCENE_PHOTOS` and a
   gradient to `SCENE_GRADIENTS` in `TonightScreen.tsx`.

---

## Known bugs

| ID | Status | Notes |
|----|--------|-------|
| A1 | ✅ fixed | iOS FileLayer scheduler — commit e70dc49 |
| A2 | 🔲 open (low) | `removeLayer` blocks on full crossfade when stopping — 30 min fix during scene transition work if it becomes noticeable |
| A3 | ✅ fixed | Pink-noise divides by 16 + hard clamp (noise-processor.js:86–89) |
| A4 | ✅ fixed | `dbPromise` drops cached promise on rejection (assets.ts:44–46) |
| A5 | 🔲 open (low) | ElevenLabs Projects API returns 405 Method Not Allowed; chunked-TTS fallback handles it but worth investigating whether the endpoint shape changed or Creator-plan grant lapsed |
| A6 | 🔲 open (info) | `tsconfig` writes UTF-16 / CRLF on Windows commits — git complains "LF will be replaced by CRLF" on every text-file add. Cosmetic only |

---

## Open questions

1. **Variant pool minimum** — fire-distant lost variant 3 in this
   batch (240s buffer too short for 409s loopOffset). The remaining
   2 variants are healthy. Other elements still at 2 variants —
   adding 3rd variants to existing scenes is a Pixabay search away,
   not blocking.
2. **Tinnitus revival** — weak evidence base + UX issues shelved it.
   Skip entirely in v1 or find a simpler entry point?
3. **ElevenLabs Projects vs chunked-TTS for stories** — chunked handled
   today's 2 stories cleanly (4 chunks each, byte-concat). The Projects
   path remains the preferred long-form route per the in-app code.
   Worth confirming whether the seam quality on chunked is acceptable
   over a real overnight listen before tearing out the Projects path.
