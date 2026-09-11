# Plan — in-app debug markers for overnight listening (2026-09-08)

Status: **EXECUTED 2026-09-11** on branch `overnight/2026-09-11` — steps 1–8
of §3.6 are built, tested and pushed; step 9 (the device pass) and step 10
(the native-loop fix) are still open. The design below is what shipped, with
two deliberate departures recorded at the end. Original header follows.

Status when written: PLAN ONLY. Nothing implemented. Written on tikiserv after pulling
`main` (fed5c0c, already up to date) and re-running the checks below.

## 1. State check (done today)

| check | result |
|---|---|
| `git pull --ff-only` | already up to date at fed5c0c; single worktree |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 18 files, 263/263 pass |
| `python tools/loopify-scenes.py --audit` | 12 of 67 variants over 3 dB |

The seam-normalisation work is where `.handoff/PENDING-DECISIONS.md` says it
is. The four FTUS re-cuts landed (night-4 0.56 dB, night-5 0.80, pavement-3
0.04, wave-4 0.01) and the new waterfall-valley files all wrap under 0.4 dB.
The 12 still over 3 dB are unchanged from the 2026-09-02 baseline:

- **4 singing-bowl stitches** (19.0 / 17.1 / 10.1 / 7.1 dB) — no
  intermediate on disk; replace, don't re-cut (already demoted 2026-07-01).
- **7 George Vlad cuts + rumble-2** (wind-1 9.8, wave-3 8.4, far-1 7.8,
  forest-2 4.6, rumble-2 3.8, birds-2 3.8, far-2 3.8, wind-2 3.5) — all
  re-cuttable through the seam search, **but the masters live in
  `raw-sounds/_sources/` on the Windows desktop, not on tikiserv** (no
  `raw-sounds/` here). That batch has to run on crane-desk, or the masters
  get copied over first (~600 MB of Opus).

So: level-matching is done for everything we *can* do from this box; the
rest is a desktop session. Nothing blocks the debug-marker work on it.

## 2. A finding that reshapes the plan: Howler's html5 loop is not native

`HowlScene` passes `loop: true` to `new Howl({ html5: true })` and the engine
notes describe each layer as "the OS owns each looping element". Reading
howler 2.2.4 (`node_modules/howler/dist/howler.js`):

- `howler.js:954` — for an html5 sound with `_loop`, Howler does **not** set
  `<audio>.loop`. It arms `setTimeout(_ended, duration_ms)`.
- `howler.js:1958` — when that timer fires and the element hasn't actually
  ended yet, it re-polls every 100 ms.
- `howler.js:1970` — once ended, it runs `stop(id, true).play(id)`: sets
  `currentTime = 0`, calls `node.play()` (promise), and re-emits `'play'`.

Consequences:

1. **Every wrap on every layer is a JS restart**, with a gap of one timer
   tick + element seek + play-promise resolution. On a phone that is tens of
   ms of silence and a hard edge on that layer, every P seconds, all night.
   The 6 s gapless wrap that `loopify-scenes.py` bakes in only helps if the
   element loops natively; under a stop/play restart the crossfade is moot
   and only the level-match still matters.
2. It is the mechanism behind the re-fired `'play'` events that `HowlLayer`
   guards with `hasFadedIn` (the 2026-07-01 "background suddenly got loud"
   bug) — those were loop wraps, not just OS interruptions.
3. If Chrome ever freezes the tab's JS (it shouldn't while another layer is
   audible, but a single-layer moment is possible), the timer doesn't fire
   and that layer stays silent until resume.

**Proposed fix (separate branch, after markers land so we can A/B it):**
construct the Howl with `loop: false` and, on the first `'play'`, set the
underlying element's native `loop = true` (`howl._sounds[0]._node` — private
but stable across 2.2.x; or read it from `Howler._html5AudioPool`). With
`loop: false` Howler attaches an `'ended'` listener instead of a timer, and a
natively looping element never fires `'ended'`, so Howler simply never
intervenes: `playing()` stays true, `fade()`/`volume()` keep working, no
replay events. Alternative if the private access is distasteful: drop Howler
for the bed and drive bare `<audio loop>` elements with our own ramp (Howler
is only supplying `fade()` here). Native `<audio loop>` on Chromium/Ogg-Opus
is close to gapless but not guaranteed sample-exact — this is precisely what
the markers should measure before and after.

## 3. Debug markers — what we're building

**Goal.** In bed, one action records "I heard something wrong *now*" with
enough context to reproduce it at the desk: which scene, which variant file
each layer was playing, each layer's position inside its loop, seconds since
scene start, wall clock, and the lifecycle events just before. Replaces the
stopwatch. Later, review it on the phone (Diagnostics) or export it and let a
script find which layer was at a wrap and render the exact excerpt.

**Non-goals.** No telemetry, no network, no notifications (brief). Off by
default; a Settings toggle turns the UI and the media-key trigger on.

### 3.1 What a marker captures

```ts
interface DebugMarker {
  ts: number;                 // wall clock, ms
  sceneId: string;
  sceneStartedAt: number;     // from the session, not the screen
  elapsedMs: number;          // ts - sceneStartedAt
  trigger: 'nightstand' | 'lush' | 'media-key';
  note?: string;              // optional, typed later in Diagnostics
  layers: Array<{
    id: string;               // "<scene>:<element>" or ":synth-bed"
    label: string;
    url: string;              // the variant actually picked (currently unrecorded anywhere!)
    periodSeconds: number;    // element loopOffsetSeconds; 887 for the bed
    seek: number | null;      // <audio>.currentTime at mark time; null if unreadable
    volume: number;           // mixer target
    outer: number;            // master × sceneGain
  }>;
  masterVolume: number;
  timerStatus: 'off' | 'running' | 'fading';
  recentEvents: string[];     // last ~8 lifecycle-log lines before ts
}
```

`seek` is read live from the element (`Howl.seek()` → `node.currentTime`),
never computed from wall time: OS audio-focus pauses and the Howler restart
gap make "elapsed mod P" drift over a night. The live read is authoritative;
the review script can back-compute every previous wrap of that layer from it.

### 3.2 Triggers

1. **Nightstand overlay** — a "Mark" button alongside "End the night" on the
   woken controls (tap to wake, tap Mark: two taps, screen stays black).
   Feedback is haptic, `navigator.vibrate(40)` (Android; no-op elsewhere),
   plus a dim one-line "marked 02:13:44" that fades with the controls. No
   brightening.
2. **Lush mode** — a small "Mark" chip next to the timer chip.
3. **Media key: `nexttrack`** — registered on the OS media session only when
   the toggle is on. Pressing "next" on earbuds or the lock-screen widget
   drops a marker without unlocking the phone. This is the one that makes it
   usable while actually falling asleep. `previoustrack` is left unbound
   (or bound to "delete last marker" — cheap, but decide).

### 3.3 Where the logic lives

- **`HowlScenePlayer` owns `markMoment(trigger)`** and `sceneStartedAt`, for
  the same reason it owns the sleep timer and media session: it must work
  from any screen and from the media-key handler, and a screen unmount must
  not lose it. It also writes a `mark` line into the lifecycle log so both
  timelines cross-reference.
- **`HowlScene.snapshot()`** returns the per-layer array above.
  `HowlLayer` needs to keep its `url` and `periodSeconds`, and `HowlLike`
  gains `seek?(): number` (the fake in tests returns a scripted value).
- **`src/diagnostics/markers.ts`** — store (`sleep-app:markers:v1`,
  separate from the 500-capped lifecycle log), `addMarker`, `getMarkers`,
  `clearMarkers`, `formatMarkersAsText()`, `exportJson()`.
- **Settings** — `debugMarkers: boolean` (default false) in
  `src/storage/types.ts` + defaults; toggle rendered in the Diagnostics
  section of `SettingsScreen` next to the existing lifecycle-log panel.
- **Diagnostics panel** — a Markers list (newest first, one row per marker
  with per-layer `file @ seek / P`, wrap distance highlighted when
  `min(seek, P - seek) < 10 s`), inline note field, Share / Copy / Download
  (text and JSON) reusing the existing `DiagButton` handlers, Clear.

### 3.4 Review tooling (the "go back and review later" half)

`tools/review-markers.py <export.json>` (stdlib + ffmpeg, like seamfit):

- For each marker × layer: print `file`, `seek/P`, distance to wrap, and
  whether that file is on the audit's over-3 dB list. Flag "seam suspect"
  when any layer was within ±10 s of its wrap.
- `--render` writes a ±20 s excerpt per marker: each layer's file seeked
  to `seek - 20` (wrapping across the file boundary exactly as the loop
  does), scaled by `volume × outer × master`, `amix`ed to one `.wav` in
  `notes/marker-renders/`. Listen at the desk to what played at that moment.
- `--wraps` back-computes each layer's wrap times since `sceneStartedAt`
  and prints the next few after the marker, so a "it happened again ~4 min
  later" observation can be matched to a specific layer.

### 3.5 Files touched

| file | change |
|---|---|
| `src/audio/howl/HowlScene.ts` | `HowlLike.seek?`, layer keeps `url`/`period`, `snapshot()` |
| `src/audio/howl/HowlScenePlayer.ts` | `sceneStartedAt`, `markMoment()`, `nexttrack` wiring gated on setting |
| `src/audio/mediaSession.ts` | `onNextTrack?` handler + clear |
| `src/diagnostics/markers.ts` (+ `.test.ts`) | new |
| `src/storage/types.ts`, `settings.ts` | `debugMarkers` |
| `src/screens/PlayerScreen.tsx` | Mark button in Nightstand + Lush, vibrate |
| `src/screens/SettingsScreen.tsx` | toggle + MarkersPanel |
| `src/screens/ContentPlayerScreen.tsx` | optional: same trigger during stories/meditations (marker gets `contentId` + narration position) |
| `tools/review-markers.py` | new |
| `src/audio/howl/HowlScene.test.ts` | snapshot with fake seek; player `markMoment` (the player's tests live in this file) |

No `CACHE_VERSION` bump: no audio files change.

### 3.6 Order of work

1. Engine: `HowlLike.seek`, layer metadata, `snapshot()`, tests.
2. `markers.ts` store + format + tests.
3. `HowlScenePlayer.markMoment` + `sceneStartedAt` + lifecycle `mark` line.
4. Settings toggle.
5. Player UI (Nightstand first — it's the one used in the dark).
6. Media-key trigger.
7. Diagnostics MarkersPanel + export.
8. `tools/review-markers.py`.
9. Device pass on the Pixel: mark in the dark, share to Drive, run the tool.
10. Then, separate branch: native-loop fix (§2), A/B'd with markers.

Each step is one commit; typecheck + tests green each time; branch + PR,
merge is Andrew's call.

## 4. Code review before starting

Recommended, and cheap, because the two files we'll change most are also
the two with the most subtle invariants (`HowlScene`'s fade guards,
`HowlScenePlayer`'s generation counter). From an interactive session:

```
/code-review high src/audio/howl src/audio/mediaSession.ts src/screens/PlayerScreen.tsx src/diagnostics
```

or, for the deeper multi-agent pass, `/code-review ultra` (user-triggered,
billed; reviews the branch, so it's more useful *after* the marker commits
exist than on a clean `main`). Ask the reviewer specifically to confirm or
refute §2 — that html5 `loop: true` never sets the element's native `loop`
and restarts via `stop().play()` — since it contradicts the engine notes in
CLAUDE.md and DECISIONS.md and should be corrected there if true.

## 5. Open questions for Andrew (none block steps 1–5)

1. Media-key `nexttrack` as a marker trigger — yes? (Shows a "next" button
   on the lock-screen widget while the toggle is on.)
2. Markers during stories/meditations too, or scenes only for now?
3. Native-loop fix (§2): fold into this branch, or keep separate so the
   markers can measure before/after? Recommendation: separate.
4. The 8 re-cuttable seams need the desktop's `raw-sounds/`; schedule a
   crane-desk session or copy the six Vlad masters to tikiserv?

---

## Execution record (2026-09-11)

Built in this order, one commit each, typecheck + tests green at every step:
the engine snapshot, the marker store, `markMoment()` on the session, the
`debugMarkers` setting + media-key trigger, the Player controls, the
Settings panel, and `tools/review-markers.py`. 339 tests pass, against 277
at the start of the night (270 of those were already on `main`).

Before any of it, the four findings the 2026-09-10 review left unfixed were
cleared — see the branch's first four commits and the hand-off.

**Departures from the plan above:**

1. **Markers during stories are IN, not deferred.** §5 listed it as an open
   question. It cost four lines: ContentPlayerScreen owns the OS media
   session while narration plays, so without re-offering the `nexttrack`
   handler there the trigger would vanish for the length of a story — and
   the bed underneath is exactly what carries seams. The marker records the
   bed's layers; it does *not* record the narration's own position, which
   would need the content screen to register state with the session. Worth
   adding only if a story's narration ever turns out to be the problem.

2. **Seam detection needed a rule the plan didn't anticipate.** Every layer
   sits at position ~0 for the first seconds of a scene, so a naive "within
   10s of the wrap" test flagged the entire stack on any early marker. A
   near-zero position now counts only once that layer has been round at
   least once; a near-end position is always reported, since a tap lags the
   sound. Ported into the Python tool so phone and desk always agree.

**Still open:** the §5 question of whether the media key should be the
trigger at all (built, but behind a default-off setting, so it is
reversible), the device pass, and the native-loop fix (§2) — deliberately
left out so the markers can measure it.
