# Bug hunt — pre-v1.0 shipping pass (2026-06-12)

Scope: full `src/` read, `public/sw.js`, `public/worklets/`, all scene JSONs +
MP3 duration audit, `npm run typecheck`, full vitest run. Findings are limited
to demonstrable bugs traced through the code; style/architecture is out of
scope.

Severity legend: **Critical** = can kill overnight audio or crash · **High** =
user-visible malfunction · **Medium** = edge case · **Low** = cosmetic/latent.

---

## CRITICAL

### C1. Leaving the Player while a scene plays tears down every background-survival mechanism — audio keeps playing unprotected

**Files:** `src/screens/PlayerScreen.tsx:150–160` (keep-alive effect),
`:305–307` (media-session cleanup), `:149` (wake lock);
`src/App.tsx:119–127` (popstate → Tonight).

**Trace:**
1. User starts a scene → Player mounts → `engine.startKeepAlive()` (silent
   loop + `<audio>` element sink), `startSwKeepAlive()`, wake lock, and
   MediaSession metadata all engage.
2. User taps **“← Scenes”** (`onExit`) — or presses the hardware/browser back
   button, which `App.tsx`’s popstate handler maps to `setScreen('tonight')`.
   Neither path stops the scene (`stopScene` is only called from the Stop
   button / timer fade). The scene keeps playing — *by design*, per the
   comment in `TonightScreen.tsx:57–62` (“picking the currently-playing scene
   re-enters Player as the way to get back”).
3. PlayerScreen unmounts. Effect cleanups run: `engine.stopKeepAlive()`
   (which also **disengages the element sink**, rerouting audio from the
   protected `<audio>` element back to bare `ctx.destination`),
   `stopSwKeepAlive()`, wake-lock release, `clearMediaSession()`.
4. The user is now on Tonight with audio audibly playing but with **no
   media-session priority, no “playing media element” discard protection, no
   silent keep-alive, no wake lock**. If they lock the phone from here (very
   plausible: browse → change mind → lock), Android Chrome treats the tab as
   a freezable/discardable background tab — the documented ~10-minute
   overnight kill that the entire recent commit history was fighting.

This state is reachable in one tap and persists indefinitely (Tonight
deliberately does not bounce back to Player).

**Fix:** Own the keep-alive/media-session lifecycle at the *session* level,
not the Player-mount level — e.g. have `SceneCoordinator.startScene()` call
`engine.startKeepAlive()` + `setMediaSessionForScene()` and `stopScene()` /
disposal stop them. The Player then only renders state. (Wake lock can stay
screen-scoped — it is visibility-bound anyway.)

---

### C2. A single refused replay of the element sink routes the whole night’s audio into a paused `<audio>` element — silence the watchdog cannot see

**Files:** `src/audio/AudioEngine.ts:308–319` (pause handler),
`src/audio/MasterBus.ts:48–61` (exclusive routing).

**Trace:**
1. `startKeepAlive()` → `engageElementSink()` reroutes the bus tail
   exclusively into a `MediaStreamAudioDestinationNode` + `<audio>` element
   (`attachElementSink` disconnects the analyser from `ctx.destination`).
2. Mid-night, the OS pauses the element *without* going through our
   MediaSession handler — transient audio-focus loss (notification sound,
   another app briefly playing, Bluetooth route change). The `'pause'`
   listener fires, records `media-sink-paused`, and makes **exactly one**
   `el.play()` retry.
3. If that retry is refused (focus still held by the other app, autoplay
   policy in a backgrounded tab), the element stays paused. The bus is still
   routed exclusively to the stream destination → **total silence**.
4. Nothing recovers: `elementSinkEngaged` is still `true` so
   `engageElementSink()` no-ops; the AudioContext is `running` with
   `currentTime` advancing, so `watchdogTick()`’s zombie detector and
   `verifyContextAlive()` both pass every check. The night stays quiet until
   the user manually restarts playback. The code comment explicitly accepts
   this (“the pause stands and the log shows why the night went quiet”) — for
   the One Thing, a log entry is not an acceptable substitute for sound.

**Fix:** When the replay attempt rejects (and on a `pause` that recurs),
fall back: `bus.detachElementSink()` + `elementSinkEngaged = false` so audio
flows directly to hardware again (losing the discard protection but keeping
the sound), and/or retry `el.play()` from the visibilitychange/watchdog
paths. Also consider having the watchdog check
`sinkElement.paused && elementSinkEngaged` as a third failure signal.

---

## HIGH

### H1. Stale sleep-timer fade timeout kills a *later* scene 90 s into it

**File:** `src/screens/PlayerScreen.tsx:225–244` (countdown effect),
`:208` (`fadeExitTimer` ref — **no unmount cleanup anywhere**).

**Trace:**
1. Sleep timer reaches 0 → `engine.bus.fadeToSilence(90)` and
   `fadeExitTimer.current = setTimeout(stopScene + onExit, 90.6 s)`.
2. User notices the fade, taps **“← Scenes”** (plain `onExit`, *not*
   `handleStop`/`cancelTimer` — those are the only places that clear the
   ref). Player unmounts; the 90.6 s timeout survives because no
   `useEffect` cleanup clears `fadeExitTimer`.
3. User picks scene B. New Player mounts; its mount effect
   `engine.bus.setMasterVolume(masterVolume)` cancels the master fade —
   scene B plays normally. All looks fine.
4. At T+90.6 s the stale timeout fires: `coordinator.stopScene(5)` fades
   scene B out, `onExit()` bounces the user to Tonight. The new night session
   is silently killed ~90 seconds in.

**Fix:** Clear the timer on unmount
(`useEffect(() => () => { if (fadeExitTimer.current) clearTimeout(...) }, [])`),
or better, move the timer-fade state machine out of the component (it has the
same lost-state problem as H3).

### H2. IndexedDB writes resolve before the transaction commits — a quota abort silently loses a paid story’s audio

**File:** `src/storage/assets.ts:51–69` (`withStore`), used by
`saveStoryAudio` / `saveStory` (`storyGenerator.ts:507–513`).

**Trace:**
1. `withStore` resolves on `request.onsuccess`. For a `readwrite` `put`,
   `onsuccess` fires when the request is processed, **before the transaction
   commits**. Quota errors (`QuotaExceededError`) characteristically surface
   at commit time via `tx.onabort` — *after* the request succeeded.
2. A generated story’s chunked-TTS WAV is ~45 MB. On a near-full device,
   `saveStoryAudio()` resolves, the transaction then aborts on quota, the
   audio row is never written — but `generateStory` has already reported
   `{ stage: 'done' }`. The user paid $1–3 for ElevenLabs synthesis.
3. Library lists the story (metadata was a separate, smaller, committed
   transaction); pressing Play hits `getStoryAudio() === null` → “Audio not
   found — try regenerating.” Paying again.

Note the asymmetry: `deleteStory` (same file, lines 86–99) correctly waits on
`tx.oncomplete` — `withStore` just never got the same treatment.

**Fix:** In `withStore`, for `readwrite` mode resolve on `tx.oncomplete`
(capture `request.result` on success first) and reject on `tx.onabort`
(currently unhandled — only `tx.onerror` is wired).

### H3. The sleep timer is silently discarded if the user leaves the Player while it’s counting down

**File:** `src/screens/PlayerScreen.tsx:198–244`.

**Trace:** Timer state (`{ status: 'running', endsAt }`) is component-local
React state, and the countdown interval is a Player-scoped effect. User sets
a 60-minute timer, taps “← Scenes” (or hits hardware back) to browse, never
returns → the interval is cleaned up on unmount and `endsAt` is garbage
collected. The scene plays at full volume all night even though the UI
confirmed “Stops in 59:32”. Re-entering the Player re-arms only the
*default* timer from settings, restarting the count from scratch.

**Fix:** Same root cause as H1 — hoist timer state to a module/sevice
(or to `SceneCoordinator`) keyed to the playback session, with the Player
merely rendering it.

---

## MEDIUM

### M1. `SceneCoordinator.startScene`/`crossfadeTo` have no concurrency guard — overlapping calls orphan a scene that plays forever

**File:** `src/audio/SceneCoordinator.ts:160–209`.

**Trace:** `crossfadeTo` captures `outgoing = this.currentScene`, then
`await this.loadScene(...)` (network fetch + decode, seconds). If a second
`startScene` lands during that window (double-fire of a tap before React
applies `disabled`, or a Tonight pick racing the ContentPlayer bed-start
effect), both calls fade the *same* outgoing scene and both `connect()` +
`start()` their incoming scene. `this.currentScene` keeps only the
last-resolved one; the other incoming Scene is referenced by nothing,
is never disposed, and **plays at full volume forever** (doubled audio all
night; only a reload stops it). UI-level `busySceneId` guards make this
low-probability but the engine API itself is unsafe, and
`restartAfterContextLoss` shows the author already had to defend this class
of race elsewhere.

**Fix:** Serialize through an in-flight promise/generation counter in the
coordinator: stamp each request, and on resolve, if a newer request has
superseded it, `scene.dispose()` instead of starting it (mirror of the
`currentScene !== dead` check in `restartAfterContextLoss`).

### M2. Scene JSON contract violation: `rain-on-window` → `rain-pavement` uses loop offset **515**, which is not on the canonical prime list

**File:** `public/scenes/rain-on-window.json` (`"loopOffsetSeconds": 515`).

CLAUDE.md hard rule 2: offsets MUST come from
`PRIME_ADJACENT_LOOP_OFFSETS_SECONDS = {251, 409, 521, 691, 887}`. 515 = 5·103
is off-list (looks like a fudge of 521). It happens to be coprime with the
scene’s other offsets (251, 409), so the audible harm is limited, but the
list is the contract.

**Trap in the obvious fix:** changing 515 → 521 makes
`pavement-2.mp3` **invalid** — it is 525 s (12 601 196 B ÷ 24 000 B/s, matches
its sidecar “trimmedTo 525s”), and FileLayer requires
`duration > loopOffset + crossfade = 526 s`, so the FileLayer constructor
would throw and the whole scene would fail to load. The fix must include
acrossfade-extending `pavement-2` (see `tools/grow-out-scenes.sh`) or
swapping the element to 409/887 with appropriate sources.

### M3. Service worker serves a cached full-body 200 to media Range requests — breaks `<audio>` seeking/playback on iOS Safari

**File:** `public/sw.js:152–164` (`cacheFirst`).

`cache.match(req)` ignores the `Range` header and returns the stored full
200 response. Howler with `html5: true` (meditations `/meditations/*.mp3`,
bundled stories `/stories/*.mp3`) issues Range requests on WebKit; iOS
Safari’s media stack expects a 206 and is well-documented to fail or refuse
to seek when a SW answers a ranged request with a plain 200. (Generated
stories use blob URLs and bypass the SW; bundled content does not.) The
device-test phase will hit this.

**Fix:** In `cacheFirst`, detect `req.headers.has('range')` and either
bypass the cache (`fetch(req)`) or synthesize a 206 slice from the cached
body.

### M4. Lock-screen / headset **pause** is mapped to full stop-and-exit — a transient OS event can end the night session

**File:** `src/screens/PlayerScreen.tsx:289` (`onPause: handleStop`).

Android fires the MediaSession `pause` action for things the user did not
intend as “end my night”: headset button bumps, Bluetooth disconnect
auto-pause, some launchers’ focus handling. `handleStop` runs the 8 s fade,
clears the scene, and exits the Player — with C1 then stripping protections.
A deliberate decision per the comment, but as implemented one stray pause
event ends overnight audio permanently (no resume affordance on the lock
screen afterwards, since the session is cleared). Consider mapping pause →
`ctx.suspend()`/soft-pause with `playbackState='paused'`, keeping the session
resumable from the lock screen.

### M5. Hardware-back from the content player leaks the blob URL and skips bed/attenuation cleanup paths

**File:** `src/App.tsx:119–131` (popstate always → `'tonight'`),
`:133–150` (`playContent`/`leaveContentPlayer`).

`leaveContentPlayer` (revokes `blobUrlRef`, clears `activeContent`) is only
called by the in-app “← Library” button. The popstate handler navigates to
Tonight directly, so: the blob URL for a 45 MB generated-story WAV is never
revoked (held for the page lifetime), `activeContent` stays set, and a later
`playContent` overwrites `blobUrlRef.current` without revoking the previous
URL — compounding leaks. (ContentPlayerScreen’s own unmount effects do run,
so audio stops; this is a memory/refcount leak, not an audio bug.)

**Fix:** route popstate through the same leave path when
`screen === 'content-player'`, and revoke any previous `blobUrlRef` in
`playContent` before overwriting.

### M6. Mid-night context rebuild can fail closed when offline-with-cold-cache

**Files:** `src/audio/SceneCoordinator.ts:233–264`,
`src/audio/FileLayer.ts:472–509`.

`restartAfterContextLoss` re-fetches and re-decodes every variant MP3. With
the SW cache warm this is fine; if the user never ran the offline download
and the network is gone at 3am (airplane mode), `loadAudioBuffer` rejects
with kind `'network'` (not `'not-found'`), the synth fallback is correctly
refused, the restart throws, `currentScene` becomes `null`, and the Player
bounces to Tonight — silence with no retry. Low probability (requires
context death *and* cold cache *and* offline) but it is the exact night-rescue
path. Consider retrying with backoff or falling back to the synth bed alone.

---

## LOW

### L1. `FileLayer` restarted after `stop()` plays silently (latent)

`scheduleFadeOut()` ramps `this.output.gain` to 0 and `start()` never
restores it (`src/audio/FileLayer.ts:163–181, 351–383`); `setVolume()` while
not playing only stores the value. A `stop()` → `start()` sequence on the
same instance produces a fully-scheduled, inaudible layer. No current caller
does this (scenes dispose layers; the harness recreates them), but it’s a
trap on a public API. Fix: `start()` should re-ramp `output.gain` to
`currentVolume`.

### L2. Scene crossfades double-apply fades → audible dip at the midpoint

`Scene.fadeAndDispose` ramps the scene master gain to 0 **and** tells every
layer to `fadeAndDispose` over the same duration (`src/audio/Scene.ts:166–176`).
The outgoing scene’s effective envelope is the *product* of two linear ramps
(quadratic), while the incoming side is a single linear ramp — at the 8 s
crossfade midpoint the sum is ~0.75 instead of ~1.0. Audible as a slight
sag when switching scenes; ironic given the equal-power care taken inside
FileLayer. Fix: fade only the scene gain and just schedule layer disposal.

### L3. `forest-day` creek element ships a single variant while `creek-2.mp3` sits unused on disk

`public/scenes/forest-day.json` lists only `creek-1`;
`public/audio/forest-day/creek-trickle/creek-2.mp3` (540 s) exists and is
already used by `forest-night`. One-line JSON fix. Related: 
`public/audio/fireplace/fire-distant/distant-3.mp3` is only **240 s** — fine
unused, but if anyone adds it to the fireplace `fire-distant` element
(offset 409) the FileLayer constructor will throw and the scene will fail to
load. Worth a comment in the sidecar.

### L4. Missing `VITE_VOICE_*` env vars fail only after the Claude spend

`STORY_VOICE_IDS` values are baked from env (`storyGenerator.ts:41–44`); if
unset, `voiceId` is `undefined` and the failure surfaces as an ElevenLabs
404 on `/v1/text-to-speech/undefined` — *after* the paid Claude call.
A cheap up-front guard in `generateStory` would save the spend.

### L5. Sleep timer uses wall-clock `Date.now()`

`endsAt = Date.now() + min*60_000` (`PlayerScreen.tsx:198–203`): a DST
spring-forward or NTP correction mid-countdown shifts the fade by the jump
amount. Arguably correct behavior for a bedside timer; noting for
completeness.

---

## Residual risks (not defects, flagged for device testing)

- **Autoplay policy on watchdog-initiated context rebuilds.**
  `recreateContext()` from `watchdogTick` runs with no user gesture; the new
  context may be born `suspended` and `resume()` may be policy-refused until
  the next gesture on low-MEI installs. The 2 s resume retry loop is the
  right mitigation; verify on real hardware.
- `crossfade.ts` schedules `setValueAtTime` at the exact start of a
  `setValueCurveAtTime` window and `Scene.fadeOut` cancels in-progress
  curves; both are legal per the current spec (cancel removes an in-progress
  curve) but were historically throwy on older WebKit. The iOS device pass
  should exercise rapid scene switching during the first 5 s ease-out.

---

## Scene-JSON audit results

Method: every scene in `public/scenes/*.json` checked against CLAUDE.md’s
hard rules; MP3 durations verified two ways (sidecar `trimmedTo` + file size
÷ bitrate from the sidecar’s declared encoding — the two agreed within 1 s on
every file; no ffprobe available in this environment).

| Scene | Elements | Offsets | ≥2 elements | Offsets on-list & distinct | Duration > offset+xfade | Voicing |
|---|---|---|---|---|---|---|
| fireplace | 2 | 251, 409 | ✓ | ✓ | ✓ (close-3: 265 s vs 256 — 9 s margin) | ✓ (0.55/0.35, synth 0.14) |
| forest-day | 3 | 251, 521, 409 | ✓ | ✓ | ✓ | ✓ — but creek has 1 variant (L3) |
| forest-evening | 4 | 251, 409, 521, 691 | ✓ | ✓ | ✓ (forest-1: 271 s vs 256) | ✓ |
| forest-night | 2 | 251, 521 | ✓ | ✓ | ✓ | ✓ |
| monsoon | 3 | 251, 409, 521 | ✓ | ✓ | ✓ | ✓ (event layer 0.20) |
| ocean-night | 3 | 251, 409, 521 | ✓ | ✓ | ✓ | ✓ (event layer 0.18) |
| rain-on-window | 3 | 409, **515**, 251 | ✓ | **✗ — 515 off-list (M2)** | ✓ today; breaks if fixed to 521 (pavement-2 = 525 s < 526) | ✓ |
| singing-bowl | 2 | 251, 409 | ✓ | ✓ | ✓ (shimmers: 420 s vs 414 — 6 s margin) | ✓ (0.58/0.28) |

Margins under 10 s (fireplace close-3, forest-evening forest-1, singing-bowl
shimmers, rain-pavement pavement-2) will break if anyone raises
`crossfadeSeconds`; fine as shipped.

## Test / typecheck results

- `npm run typecheck` (`tsc --noEmit`): **clean**.
- `npx vitest run`: **10 files, 138 tests, all passing** (6.3 s). The
  “Not implemented: HTMLMediaElement play()/pause()” lines are jsdom noise
  from the element-sink tests, not failures.

None of the bugs above are covered by existing tests; H1/H3 (timer
lifecycle) and M1 (coordinator concurrency) are the most testable —
H2 needs a fake-IDB abort-after-success harness.
