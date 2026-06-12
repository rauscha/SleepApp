# Roadmap to v1.1 — executable playbook

**Source:** Full shipping review, 2026-06-12 (reports `00`–`08` in this directory).
**Audience:** An autonomous coding agent executing steps in order, plus Andrew supervising.
**State tracking:** Check boxes off in this file AND mirror progress in `NEXT_STEPS.md` (if present) as steps complete.

---

## Ground rules for the executing agent

1. **Read `CLAUDE.md` and `DECISIONS.md` in full before step 1.** The scene-offset contract, the FileLayer pipeline invariants, and the commit discipline there are binding.
2. **One step = one commit** (unless a step says otherwise). Before every commit: `npm run typecheck` and `npm test` must both be clean. Run `npm run build` after steps marked **[build-check]**.
3. **Commit style:** short imperative subject; body explaining what and why; a `Validated:` line stating what you ran; `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
4. **Never** commit `.env*`, key-bearing files, or the `reviews/` directory (gitignored).
5. Steps tagged **[ASK]** need Andrew's input (asset choice or product decision). Do not guess — skip the step, leave its box unchecked, note it in `NEXT_STEPS.md`, and continue with the next step.
6. Steps tagged **[DEVICE]** can only be validated on real hardware. Implement, validate what's testable locally, and list the device-test step in `NEXT_STEPS.md` under "Device pass".
7. **The One Thing rules every trade-off:** put me to sleep and let me stay there. When in doubt, prefer "sound keeps playing" over any other property, and "fails loudly at 11pm" over "fails silently at 3am".
8. After finishing a phase, re-read the relevant full report (listed at each phase head) to confirm nothing in scope was missed.

---

## Phase 1 — Ship blockers (report `03-bug-hunt.md`, Critical + High)

These five bugs each break The One Thing. Nothing else lands before they do.

### ☑ 1.1 Move keep-alive/media-session ownership from PlayerScreen to the playback session (bug C1)

- **Files:** `src/screens/PlayerScreen.tsx:150–160, 305–307`, `src/audio/SceneCoordinator.ts`, `src/audio/AudioEngine.ts`
- **Bug:** PlayerScreen's unmount cleanup runs `engine.stopKeepAlive()` (which also disengages the `<audio>` element sink), `stopSwKeepAlive()`, and `clearMediaSession()` — but "← Scenes" and hardware-back deliberately leave the scene playing. One tap leaves overnight audio in a freely-discardable tab (~10-min Android kill).
- **Fix:** `SceneCoordinator.startScene()` engages keep-alive + SW keep-alive + media-session; `stopScene()`/disposal stops them. PlayerScreen only renders state and keeps the screen-scoped wake lock (it is visibility-bound anyway). Audit every current call site of `startKeepAlive`/`stopKeepAlive`/`setMediaSession*`/`clearMediaSession` so nothing double-starts or double-stops; mind the content-player path, which has its own bed-scene usage.
- **Accept:** Start a scene → leave Player → keep-alive, element sink, SW pings, and media session all still engaged (assert via the engine's state + lifecycle log entries). Stop the scene from anywhere → all torn down. Add a regression test at the coordinator level.

### ☑ 1.2 Element-sink pause recovery — never leave the bus routed into a paused element (bug C2)

- **Files:** `src/audio/AudioEngine.ts:308–319` (pause handler), `src/audio/MasterBus.ts:48–61`
- **Bug:** After an OS-initiated element pause, exactly one `el.play()` retry; if refused, audio flows into a paused sink forever — AudioContext stays `running` with `currentTime` advancing, so the zombie watchdog and `verifyContextAlive()` are both blind to it.
- **Fix (all three layers):** (a) if the replay attempt rejects, `bus.detachElementSink()` and set `elementSinkEngaged = false` so sound reaches hardware again (log `media-sink-fallback`); (b) retry `el.play()` from the visibilitychange path; (c) add `sinkElement.paused && elementSinkEngaged` as a third failure signal in `watchdogTick()` so the watchdog re-attempts play / falls back on its cadence.
- **Accept:** Unit test: simulate pause + rejected play → bus is detached from the sink and audible routing restored; watchdog test covers the paused-sink signal. Lifecycle log records each transition.

### ☑ 1.3 Hoist the sleep timer out of PlayerScreen (bugs H1 + H3 — same root cause)

- **Files:** `src/screens/PlayerScreen.tsx:198–244` (timer state, countdown effect, `fadeExitTimer` ref)
- **Bugs:** (H1) `fadeExitTimer` is never cleared on unmount — timer fires → user exits mid-fade → starts scene B → 90.6s later the stale timeout `stopScene()`s the new session. (H3) Timer state is component-local — leave the Player and a confirmed 60-min timer silently evaporates; the scene plays all night.
- **Fix:** Move the timer state machine (set/running/`endsAt`/fade/exit) into a module-level service or onto `SceneCoordinator`, keyed to the playback session: starting a new scene cancels the previous session's timer + pending fade-exit; the Player only renders countdown state and issues commands. Wall-clock `Date.now()` basis is accepted as-is (L5).
- **Accept:** Fake-timer vitest covering: timer runs while Player unmounted and still fades/stops on schedule; exit-during-fade + new scene start does NOT kill scene B; re-entering Player shows the live countdown, not a re-armed default. (This is also code-review item #10 — the riskiest untested state machine.)

### ☑ 1.4 Make IndexedDB writes resolve on transaction commit (bug H2)

- **File:** `src/storage/assets.ts:51–69` (`withStore`)
- **Bug:** Resolves on `request.onsuccess`, which fires before commit; a `QuotaExceededError` abort then silently loses a ~45 MB story WAV the user paid $1–3 to synthesize, while `generateStory` reports done.
- **Fix:** For `readwrite` mode, capture `request.result` on success but resolve on `tx.oncomplete`; reject on `tx.onabort` (currently unwired) and `tx.onerror`. Mirror the already-correct pattern in `deleteStory` (same file, lines 86–99). Then make `generateStory` surface a save failure as a failed stage, not `done` — and since the metadata row commits separately, on audio-save failure delete the orphaned metadata so the Library never lists an unplayable story.
- **Accept:** Test with a fake IDB that aborts after request success → caller rejects, no metadata orphan.

### ☑ 1.5 Serialize SceneCoordinator scene starts (bug M1 — promoted: it doubles audio all night)

- **File:** `src/audio/SceneCoordinator.ts:160–209`
- **Bug:** Overlapping `startScene`/`crossfadeTo` calls both capture the same outgoing scene and both start an incoming scene; the loser is referenced by nothing and plays at full volume until reload.
- **Fix:** Generation counter / in-flight promise: stamp each request; on resolve, if superseded, `scene.dispose()` instead of `connect()`+`start()` (mirror the `currentScene !== dead` check in `restartAfterContextLoss`).
- **Accept:** Test: two racing `startScene` calls → exactly one playing scene, loser disposed.

---

## Phase 2 — Scene contract enforcement (reports `03` M2/L3, `02` must-fix 1/2/7)

### ☑ 2.1 Extend `pavement-2.mp3` past 526s, then fix 515 → 521

- **Files:** `public/audio/rain-on-window/rain-pavement/pavement-2.mp3` (+ its `.json` sidecar), `public/scenes/rain-on-window.json:37`
- **Trap (found in review):** the offset fix alone breaks the scene — `pavement-2.mp3` is 525s and FileLayer requires duration > offset + 5s crossfade = 526s; the constructor would throw and the whole scene fails to load.
- **Fix, in one commit:** acrossfade-extend `pavement-2.mp3` to ≥ 535s (use the pattern in `tools/grow-out-scenes.sh`; requires ffmpeg — if unavailable, tag this step [ASK] and stop before touching the JSON), update its sidecar's `trimmedTo`, then change `"loopOffsetSeconds": 515` → `521` (521 is unused in this scene; offsets become 409/521/251 — distinct, on-list).
- **Accept:** New duration verified (ffprobe or size ÷ bitrate); scene loads; 2.2's conformance test passes.

### ☑ 2.2 Add the scene-JSON conformance test — make the contract enforce itself

- **New file:** e.g. `src/audio/sceneCatalogue.test.ts`, reading every `public/scenes/*.json` + `public/scenes/index.json` + variant sidecars.
- **Assert, per CLAUDE.md hard rules:** ≥2 elements per scene; every `loopOffsetSeconds` ∈ `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`; offsets distinct within a scene; every variant duration (sidecar `trimmedTo`, fall back to size÷bitrate) > offset + crossfade, **warn under 10s margin** (review found four scenes with <10s margins that break if `crossfadeSeconds` is ever raised); element volumes within the voicing bands (primary ~0.55–0.60, support 0.25–0.35, synth 0.10–0.16, events ≤ ~0.20); every variant file referenced actually exists.
- **Accept:** Test fails on current tree until 2.1 lands; green after.

### ☑ 2.3 Small scene-catalogue fixes (one commit)

- `public/scenes/forest-day.json`: add the already-on-disk second creek variant `public/audio/forest-day/creek-trickle/creek-2.mp3` (540s — used by forest-night already) to the creek element.
- `src/audio/sceneFormat.ts:52–55`: fix the stale doc comment still recommending the broken non-coprime 253/407/511 offsets the constant below it repudiates.
- Add a sidecar comment to `public/audio/fireplace/fire-distant/distant-3.mp3` (240s — too short for any current offset; constructor will throw if anyone wires it in).
- **Accept:** conformance test green; comment accuracy verified against `PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`.

---

## Phase 3 — Fail loudly, not silently (reports `01`, `02`, `03` M3–M6)

### ☐ 3.1 Gate `fallbackToSynthetic` on dev builds **[build-check]**

- **Files:** `src/audio/SceneCoordinator.ts:99` (default), `src/screens/TonightScreen.tsx:81`, `src/screens/ContentPlayerScreen.tsx:163`
- A 404 from a bad deploy currently whispers a synthesized test pad all night. Default the option to `import.meta.env.DEV`; in production a missing-file load must fail visibly (Player error state), not impersonate the scene.
- **Accept:** prod-mode test (or build + manual check) shows load failure surfaces an error; dev harness behavior unchanged.

### ☐ 3.2 Make a key-bearing production bundle structurally impossible **[build-check]**

- **File:** `src/storage/apiKeys.ts:17–29`
- Gate the `VITE_*` env-key fallback on `import.meta.env.DEV` so `npm run build` can never inline live keys (security report's one Medium-risk cluster; CI already refuses to pass keys — this closes the local-build hole). Consider `sourcemap` off for prod builds in `vite.config.ts` while there (Low finding).
- **Accept:** grep the built `dist/` for any `VITE_`-sourced key path; localStorage key flow unchanged.

### ☐ 3.3 Delete dead `src/audio/Analyser.ts`

- Zero references (harness uses `engine.bus.analyser` directly). Delete file + any type exports.
- **Accept:** typecheck + tests green.

### ☐ 3.4 Service worker: don't answer media Range requests with a cached 200 (bug M3) **[DEVICE]**

- **File:** `public/sw.js:152–164` (`cacheFirst`)
- iOS Safari's media stack chokes when a ranged `<audio>` request gets a full-body 200. If `req.headers.has('range')`: bypass to `fetch(req)`, or synthesize a 206 slice from the cached body (preferred for offline playback of meditations/stories — they're the `html5: true` Howler paths).
- **Accept:** unit-level test of the handler logic; real validation on the iOS device pass.

### ☐ 3.5 Route hardware-back through `leaveContentPlayer` + revoke stale blob URLs (bug M5)

- **File:** `src/App.tsx:119–150`
- popstate from `content-player` must run the same leave path as "← Library" (revoke `blobUrlRef`, clear `activeContent`); `playContent` must revoke any previous `blobUrlRef.current` before overwriting.
- **Accept:** test or manual trace; no compounding 45 MB blob leaks.

### ☐ 3.6 [ASK] Lock-screen pause semantics (bug M4)

- **File:** `src/screens/PlayerScreen.tsx:289` (`onPause: handleStop`)
- Today a stray headset bump / Bluetooth disconnect runs the full stop-and-exit — and after 1.1's fix the session is cleanly gone, unrecoverable from the lock screen. Review recommends soft-pause (`ctx.suspend()` + `playbackState='paused'`, resumable). The current mapping was a deliberate decision per the code comment — **Andrew must choose** before changing it.

### ☐ 3.7 Night-rescue resilience when offline with a cold cache (bug M6)

- **Files:** `src/audio/SceneCoordinator.ts:233–264`, `src/audio/FileLayer.ts:472–509`
- `restartAfterContextLoss` currently fails closed (silence, bounce to Tonight) if re-fetch fails at 3am. Add retry-with-backoff, and on final failure fall back to the synth bed alone (this specific path is the one legitimate prod use of synthetic audio — sound beats silence at 3am).
- **Accept:** test the failure path with a mocked network rejection.

---

## Phase 4 — Visual identity (report `04`, must-fix list; convergent with `06`)

### ☐ 4.1 Ship the serif **[build-check]**

- **Files:** `src/index.css`, `public/fonts/`, `tailwind.config.js`, `index.html` (preload), `public/sw.js`/precache list
- `font-serif` declares EB Garamond but no serif `@font-face` exists — headings render Georgia (iOS) / Noto Serif (Android). Self-host an EB Garamond subset (400 + 500, latin, woff2) exactly like Inter is done; preload it; ensure it's offline-cached.
- **Accept:** built page serves the woff2; no FOUT longer than the Inter pattern; offline load still styled.

### ☐ 4.2 Promote the two failing text colors

- All screens; ~20 call sites, mechanical by role: reading-text uses of `stone-400` → `stone-300` (4.11:1 → passes AA on ink-950); `stone-500` nav labels/meta (2.33:1 at 12px) → `stone-400`+. Reserve `stone-400` for decoration, `stone-500` for non-text.
- **Accept:** recompute the contrast pairs touched; all body/label text ≥ 4.5:1 (≥ 3:1 only where genuinely large text).

### ☐ 4.3 [ASK] Replace the three off-brief photos

- `singing-bowl.jpg` (Buddha-statue stock — literally the brief's banned "loud wellness iconography"), `forest-day.jpg` (daylight garden path with pedestrian), `monsoon.jpg` (near-white sky = flashlight at 2am). Quality bar: `ocean-night.jpg`. Andrew picks/sources images; agent then optimizes, updates `public/scenes/photos/NOTICES.md`, and applies a tonal-grade/scrim pass so no card can be bright at night (review item 8: crush blacks toward `#0B0D10`, cap highlight luminance — apply set-wide).

### ☐ 4.4 Sleepy-ergonomics fixes (one commit)

- `src/screens/TonightScreen.tsx:258`: scene-card descriptions 14px → 16px (they're reading text under the app's own rule).
- `src/screens/PlayerScreen.tsx:36` + overlay classes: Nightstand wake window 3s → ~7s; woken-controls opacity 40% → ~60%.
- Demote the 128px ember Stop disc: keep the ≥44px target, ghost-ring or warm-stone fill instead of full ember; let the scene photo be the hero. Consider "End the night" label.
- **Accept:** visual self-check via dev server; type/test green.

### ☐ 4.5 Polish sweep (one commit)

- `SettingsScreen.tsx`: `text-red-400` → `text-ember-400`; phantom `placeholder-ink-400` → `placeholder-stone-500` (verify contrast on ink-800).
- Gate the Tonight "Dev tools" button behind `import.meta.env.DEV` (and extract the ~700-line Harness from `App.tsx` into a lazy-loaded module — code-review should-fix #5, kills it from the prod bundle entirely).
- `LibraryScreen.tsx:23`: import `resolvePublicUrl` from `lib/baseUrl`; replace the CLI command in the Library empty state with "Generate one from the Stories tab."
- Normalize `px-5`/`px-6` gutters to one rhythm; add a designed `focus-visible` ring (moon-400) app-wide; slider hit areas ≥44px effective.
- **Accept:** build-check; bundle for main chunk should drop noticeably with the Harness extraction.

---

## Phase 5 — Call it v1.0

### ☐ 5.1 Tooling guard: add ESLint (`typescript-eslint` + `react-hooks`)

The codebase's failure mode is an unawaited promise or stale effect dep; nothing currently enforces the rules its `eslint-disable` comments imply. Fix or explicitly annotate what it flags. **Accept:** `npx eslint src` clean; wire into `package.json` scripts.

### ☐ 5.2 [DEVICE] Device pass + tag

Run the existing Phase-5 plan (PWA install, iOS Safari device test, perf) plus the review's device-test list: SW Range fix (3.4), watchdog rebuild under autoplay policy (no-gesture `recreateContext`), rapid scene-switch during the first 5s ease-out on WebKit, overnight run with the new session-owned keep-alive. Then bump `version` to `1.0.0`, tag, and update `DECISIONS.md` (append, never overwrite) with a short v1.0 entry.

---

## Phase 6 — v1.1: make the promise whole (reports `05`, `06`, `08`)

Order matters: 6.1 is the biggest utility gap; 6.2–6.3 are the ideation trio that compounds with it.

### ☐ 6.1 The 3 a.m. Door

- **Builds on:** `src/lib/bedtime.ts` (add a deep-night window predicate), `lastSceneId` in settings, `SceneCoordinator.startScene()`'s existing `firstFadeSeconds` option.
- Opening the app in the deep-night window while nothing plays shows a single near-black panel — one line, one tap: resume the last scene at reduced volume with a long (~30s) first fade. No nav, no photos, no white text. Escape hatch to the normal app in a dim corner.
- **Accept:** unit tests for the window predicate + resume params; manual dev-server check of the panel's luminance.

### ☐ 6.2 Night Drift

- **Builds on:** the forest day/evening/night triptych in `public/scenes/` + `SceneCoordinator.crossfadeTo()` with a stretched crossfade.
- A scene JSON gains an optional `driftsTo: { sceneId, afterMinutes, crossfadeSeconds }`; forest-evening drifts into forest-night ~40 min in via a very long crossfade. Timer scheduling must live at the coordinator/session level (per 1.3's pattern), survive Player unmount, and be cancelled by scene stop/switch.
- **Accept:** fake-timer test of the drift schedule + cancellation; conformance test extended to validate `driftsTo` targets exist.

### ☐ 6.3 Narration Sundown

- **Builds on:** `durationSeconds` already stored in `StoryMetadata`; Howler volume control in `src/screens/ContentPlayerScreen.tsx`.
- Story narration rides a slow gain ramp over its final third so the voice submerges under the paired scene bed instead of ending (a state change is a wake event). Settings toggle, default on.
- **Accept:** test the ramp math; manual listen.

### ☐ 6.4 Bedtime greeting + make the Eno engine legible (one commit, ~15 lines total)

- Tonight subtitle swaps by hour via `isBedtime()`-style logic (late-evening / small-hours / early-morning variants) — the function and tests already exist and are currently used only to disable a button.
- One line of player copy: *"Layered live on prime-length loops — tonight's soundscape won't repeat."* This is the app's deepest engineering converted into its best moment for free (the fun review's #1 and #2 cheapest delights, and the originality review's "invisible engine" finding).

### ☐ 6.5 [ASK] Meditation catalogue rethink

Originality rated the three bundled AI meditations the app's one "poorly copied" feature (boilerplate prompts, worse than free human-narrated competitors); utility rated the ~25-min catalogue its stale point. **Decide with Andrew:** invest the prompt/voice craft the stories got (then expand to ~10 via `tools/gen-meditation.ts`), or cut the category. Either way: write real descriptions to replace "A body scan meditation." in the app's editorial voice.

### ☐ 6.6 Library voice pass (cheap, after 6.5)

Pair each story with one italic line of its own prose in the Library card; in-world generator progress copy ("Tide is reading your story…" over "Synthesizing chunk 3 of 5…").

---

## Do not build (re-affirmed by the review — report `08` anti-ideas)

Sleep tracking / scores / mic detection · smart alarm or sunrise wake (no-alarm is load-bearing identity) · cloud sync / sharing / social · voice control. Also: do not "improve" the no-telemetry, no-accounts, no-onboarding stance — it rated as a feature in every subjective review.

---

## Standing validation block

```
npm run typecheck   # must be clean before every commit
npm test            # 138+ tests, must be green before every commit
npm run build       # at [build-check] steps; watch main-chunk size (baseline 63.8 kB gz)
```
