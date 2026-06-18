# Bug reports — 2026-06-17 (overnight listening session)

Captured from a real overnight listen. None of these block v1.0 except where
noted; the audio ones (B1–B4) are the priority morning batch because they're
the kind of seam/level defects that wake you up. B5 is a curious-only finding.

Status legend: `[ ]` open · `[~]` partially understood · `[x]` done.

---

### Overnight build update — 2026-06-18

Autonomous pass landed the safe, verifiable fixes; the audio bugs are
blocked on assets we don't have in-repo.

- **B5 — done.** Forest Day birds 0.35 → 0.25.
- **B6 — fix shipped, needs device-verify.** Shell sized to `100svh` so the
  nav can't fall off a cold launch.
- **B7 — mitigations shipped, root-cause still device-dependent.** Stop
  swallowing `listStories()` errors (+ retry + re-read on resume); request
  persistence from the generate gesture; warn + steer to Export when storage
  isn't persistent. The morning diagnostic (check the `storage-persist` log
  value on the device) still decides whether eviction actually fired.
- **B1–B4 — blocked on source audio.** The shipped scene MP3s are already
  trimmed in place; there are **no untrimmed originals in the repo**, and
  `loopify-scenes.py` skips files already at their prime. Removing the
  Forest-Night drone (B1), re-cutting to similar A→B points (B3), and fixing
  the Ocean swell seam (B4) all need the originals + ears. The equal-power
  curve fix (B2) is specced and ready to apply to `loopify` once the sources
  are located. **First morning step: find/restore the pre-trim source clips.**

---

## B1 — Forest Night: "wind in leaves" has an incongruous car/plane sound `[ ]`

**Symptom.** In *Forest, night* the `wind-in-leaves` layer contains a low
passing-vehicle / high-overhead-plane drone partway through the clip. It reads
as wrong for "the woods after dark" and, worse, it's the tell that exposes the
loop seam (see B2): the drone is present mid-file but **absent at the loop
boundary**, so when the file wraps, the sound abruptly drops out and the bed
audibly "cuts back to the beginning."

**Files to audit** (forest-night reuses forest-day's wind element — both
variants, random rotation, so check both):
- `public/audio/forest-day/wind-in-leaves/wind-1.mp3` (Pixabay)
- `public/audio/forest-day/wind-in-leaves/wind-2.mp3` (user-provided)

Note: forest-evening keeps its **own** scene-local copies of these (different
prime, see `loopify-scenes.py` `FE_LOCAL_COPIES`):
- `public/audio/forest-evening/wind-in-leaves/wind-*.mp3` — fix there too, or
  re-derive from the cleaned forest-day source and re-run loopify.

**Fix options (morning):**
1. Find the offending region by ear (and/or a spectrogram — the drone is a
   sustained low/mid band that doesn't belong with broadband leaf rustle) and
   pick loop points A→B that *exclude* it entirely (this dovetails with B3).
2. If the drone spans too much of the clip to excise, replace the source clip
   with a cleaner wind recording.
3. Re-run `tools/loopify-scenes.py` after, and confirm `npm test`
   (`sceneCatalogue.test.ts`) still passes the prime-length check.

---

## B2 — Loop wrap uses a LINEAR crossfade; it should be EQUAL-POWER (constant-power) `[ ]`

**This is the one to "look up the right fade curve" for. Findings below.**

**Symptom.** Sharp/audible cutoff when an element loops back to its start
(reported on Forest Night's wind — B1 — and on Ocean Night's swelling wave —
B4). The incommensurate-loop math is correct (distinct primes per element), but
the per-file loop *wrap* isn't blending cleanly.

**Root cause in our code.** `tools/loopify-scenes.py` builds the gapless wrap
(`seamless_loop()`, lines ~68–84) like this:

```
[0:a] head = atrim 0:C,        afade=t=in:d=C      # fade the head IN
[1:a] tail = atrim period:p+C, afade=t=out:d=C     # fade post-loop tail OUT
[head][tailf] amix=inputs=2:normalize=0            # sum them
```

`afade` with **no `curve=` argument defaults to `tri` (triangular = linear)**.
Two linear ramps summed = a **linear crossfade**. That is the wrong curve for
our material.

### Which curve is correct — and why

The right curve depends on whether the two things being mixed are *correlated*
(the same waveform, phase-aligned) or *uncorrelated* (independent signals):

| Curve | gain_out, gain_in | Sums flat for… | Artifact on the other kind |
|---|---|---|---|
| **Linear** | `1−t`, `t` | **correlated** signals (amplitudes add to 1) | ~**−3 dB power dip** at the midpoint for uncorrelated |
| **Equal-power** (sin/cos) | `cos(t·π/2)`, `sin(t·π/2)` | **uncorrelated** signals (`sin²+cos²=1`) | ~**+3 dB bump** for fully correlated |

Our loop wrap mixes the **tail of an ambient field recording over its own
head** — two *different moments in time* of broadband, noise-like material
(wind, surf, rustle). Different moments of a nature recording are effectively
**uncorrelated**, so the correct curve is **equal-power (constant-power),
i.e. the sine/cosine law** — not the linear one we ship today. The linear wrap
is producing the ~3 dB loudness sag at the seam center, which is exactly the
"something dips / cuts" artifact.

(Caveat worth keeping in mind while implementing alongside B3: if we pick
A/B loop points that are *highly* similar — near-correlated — linear would
actually be the safer choice there. For genuinely matched points the
difference is small; equal-power is the safe default for our noise-like beds.
Decide per element by ear.)

### Concrete fix in ffmpeg

Use the quarter-sine curve, which is the equal-power curve, on **both** legs:

```
afade=t=in:st=0:d=C:curve=qsin     # head in
afade=t=out:st=0:d=C:curve=qsin    # tail out   (qsin out = cos ramp)
```

…then keep `amix=normalize=0`. (Equivalently, ffmpeg's `acrossfade` filter
with `c1=qsin:c2=qsin` IS a one-shot equal-power crossfade — note our existing
`build-singing-bowl-scene.sh` / `grow-out-scenes.sh` use `c1=tri:c2=tri`,
i.e. linear, and may want the same treatment.)

**Implementation checklist:**
- [ ] Change the two `afade` calls in `loopify-scenes.py:seamless_loop()` to
      `curve=qsin`.
- [ ] Re-run `tools/loopify-scenes.py` (idempotent — but note it skips files
      already at their prime length within 2 s; we'll need to force a rebuild,
      e.g. regenerate from the untrimmed sources, since the trimmed files are
      now the only copies. **Confirm we still have the pre-trim originals**
      before relying on re-running loopify.)
- [ ] A/B the seam by ear on Forest Night + Ocean Night.
- [ ] `npm test` green (prime-length contract).

---

## B3 — Pick mid-clip loop points A→B that are sonically similar `[ ]`

**Idea (applies to every scene element).** Today `loopify-scenes.py` trims each
variant to `[0 … prime]` — an **arbitrary head-to-tail cut**, so the wrap has
to blend two unrelated instants. Better: hunt within each *original* clip for
two points A and B that are already sonically similar (matched level, spectral
balance, no transient straddling the seam) and cut **A→B** instead. The loop
length is still a prime (the contract in CLAUDE.md), but it's now a **mid-clip
excerpt** rather than from-the-top. A good A→B pair makes the crossfade (B2)
nearly inaudible and lets us route around bad regions like B1's plane drone.

**How this changes the pipeline (design, not yet built):**
- `loopify-scenes.py` currently assumes `start = 0`. We'd add a per-variant
  `loopStartSeconds` (default 0) so it cuts `[start … start+prime]`, with the
  wrap built from the segment just past `start+prime`.
- Either author A points by hand in the sidecar `.json`, or write a small
  helper that scores candidate cut points by short-window RMS + spectral
  centroid similarity and suggests the closest pair near the target prime
  length. Hand-picking 2–3 per scene is probably faster for v1.
- Keep the prime as the loop *length*; A is just the offset into the source.

**Don't forget:** the original (untrimmed) source clips are required for this —
verify they still exist (see B2 caveat) before designing around re-cutting.

---

## B4 — Ocean Night: sharp cutoff at loop end on the swelling wave `[ ]`

**Symptom.** Same class as B1/B2 — at the end of a loop in *Ocean, at night*
there's a hard cutoff right as a wave is swelling, so the swell gets guillotined
and snaps back. A crescendo straddling the loop boundary is the worst case for
a from-the-top cut: the head starts mid-trough, so even a perfect crossfade
fights the rising envelope.

**Files:** `public/audio/ocean-night/waves/wave-{1,2,3}.mp3` (near surf, the
loud `defaultVolume: 0.55` layer at prime 251 — most likely culprit). Possibly
`waves-far/far-*.mp3` (409) too.

**Fix.** Best addressed by B3 (choose A→B so the seam lands in a quiet trough
*between* swells, never mid-crescendo) plus B2's equal-power wrap. Verify by
ear after re-looping.

---

## B5 — Forest Day: birds too loud by default `[x]` (done 2026-06-18 — 0.35→0.25)

**Symptom.** In *Forest, midday* the `distant-birds` layer sits too hot at its
default. Dial it down for the default mix.

**Change.** `public/scenes/forest-day.json` → `distant-birds.defaultVolume`,
currently **0.35**. Drop toward ~**0.22–0.25** (supporting-layer range per the
"voice the stack like a mix" rule in CLAUDE.md; birds are a colour, not the
lead). Tune by ear against the wind lead (0.55) and creek (0.40).
No re-encode needed — this is a catalogue value, not an audio file.

---

## B6 — PWA: bottom nav bar sometimes missing on cold launch `[~]` (NOT a v1.0 blocker)

**Symptom.** Occasionally on starting the installed PWA, the bottom tab bar
(`BottomNav`) doesn't appear; restarting the app fixes it. Intermittent.

**Most likely cause — `100dvh` cold-start layout race.** The height chain is
`html, body, #root { height: 100dvh }` (`src/index.css:56–61`) with
`overflow: hidden`, and `App.tsx` lays out as a flex column: a `flex-1
min-h-0 overflow-y-auto` `<main>` above a `shrink-0` `<nav>` (`App.tsx:220–289`).
On a **cold standalone-PWA launch**, the dynamic viewport (`dvh`) is sometimes
resolved before the OS has settled the system-bar insets, so `#root` is laid
out taller than the actually-visible area for the first paint. Because the root
is `overflow:hidden` and `<main>` is `flex-1`, the `shrink-0` nav gets pushed
**below the visible fold** and never scrolls into view. A relaunch reads the
now-cached viewport metrics correctly, so it renders — matching "restart fixes
it." (The `index.html` comment already documents a *related* inset trap with
`viewport-fit=cover`; this is the dvh-timing cousin of it.)

**Less likely (rule out):** cold launch landing on an immersive screen. The
initial-screen initializer (`App.tsx:87–94`) hides the nav on `player` /
`deep-night-door`. If `coordinator.getCurrentScene()` ever returns truthy on a
fresh process, or `isDeepNight() && lastSceneId` fires, you'd start on a
nav-less screen by design — looks identical to the bug. Worth confirming the
missing-nav launches were on Tonight.

**Suggested investigation / fix (morning, low priority):**
- Reproduce on the physical device; check whether it correlates with launch
  orientation, having-just-installed, or time-of-day (deep-night door path).
- If it's the dvh race: add a `100svh` floor or a post-`load` /
  `visualViewport` `resize` reflow nudge, or pin the nav with the layout so it
  can't be pushed below the fold (e.g. constrain the flex column to the
  *small* viewport height). Re-test cold launches.

---

## B7 — Stories tab: a generated story went missing at night ("astronomer" lost) `[~]` (HIGH — possible data loss)

**Symptom (two reports, possibly the same root).** At night, a generated story
was missing from the Stories tab — and it seems the *astronomer* story was
actually **deleted**, not merely hidden behind the generate gate.

**Code check — there is NO intended time-based hiding of saved stories.** In
`src/screens/LibraryScreen.tsx` only the *Generate* button is gated by bedtime
(`disabled={bedtime}`, plus the "A daytime activity. Try again after 6am."
note, ~L283–301). The saved-story **list itself** (~L319–336) renders
regardless of time. So a story vanishing at night is NOT by design — it points
to one of two real problems:

**(a) Silent list-load failure (hiding, no loss).** `refreshStories()` does
`listStories().then(setStories).catch(console.error)` (~L106–108). If
`listStories()` rejects — e.g. a transient IndexedDB open failure right after
the OS resumes a backgrounded PWA overnight — the error is swallowed and
`stories` stays at its initial `[]`, so the list shows **empty** until a
reload. That matches "restart fixes it" (same flavour as B6). *Fix idea:*
surface a load error + retry instead of silently showing empty; consider one
auto-retry.

**(b) IndexedDB eviction (real loss).** Confirmed by code search: there is **no
automatic prune/clear path** anywhere in `src/` (no `deleteDatabase`,
`store.clear`, `caches.delete`, no `MAX_`/prune logic). `deleteStory` only
fires from an explicit in-UI confirm. So spontaneous loss of a saved story is
almost certainly **storage eviction**: `requestPersistentStorage()`
(`src/storage/assets.ts:35`) is best-effort, and if the persistence grant was
denied, the OS can reclaim this origin's IndexedDB under storage pressure —
most likely overnight while backgrounded. This is the exact scenario the
Download/Export button was built to mitigate.

**Diagnostics to grab in the morning (before assuming a fix):**
- Check the lifecycle log for the `storage-persist` event value on this device
  — we already `recordEvent('storage-persist', granted|denied)` on launch
  (`src/App.tsx:103`). If it's `denied`, eviction (b) is the cause.
- The moment a story "disappears," *before* restarting: open the Stories tab
  and check the console for a `[LibraryScreen]`/`listStories` error. Its
  presence ⇒ silent-list-failure (a); its absence ⇒ true eviction (b).
- In devtools: `navigator.storage.persisted()` and `navigator.storage.estimate()`.

**Fix directions (decide after diagnosis):**
- If (b): warn the user when storage is *not* persistent, re-request more
  assertively, and surface the export affordance prominently (a paid story
  should be one tap from a permanent download). Possibly auto-export on
  generate.
- If (a): don't swallow the list error — show a retry, and re-run
  `refreshStories` on focus/visibilitychange so a resumed PWA re-reads IDB.

**Files:** `src/screens/LibraryScreen.tsx` (silent `refreshStories` catch),
`src/storage/assets.ts` (`requestPersistentStorage`, schema), `src/App.tsx`
(persist request + `recordEvent` on launch).

**Severity: HIGH** — generated stories cost real API money; losing one is the
worst non-crash outcome in the app. Worth the morning diagnostic even though
it's not an audio-batch item.
