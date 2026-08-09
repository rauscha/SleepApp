# Fix plan — 2026-07-02 code review of the audio-refresh commits

Source: /code-review (high effort) over `9321c55..1369e5d` — `tools/loopify-scenes.py`,
`src/audio/howl/HowlScene.ts` (`hasFadedIn` fix), `src/audio/sceneCatalogue.test.ts`,
and the scene-JSON edits. 10 findings survived verification (9 CONFIRMED, 1 PLAUSIBLE).
This file is the execution plan; it is written to be executable by a session with **no
other context**. Work top to bottom. Check items off here as they land.

**Phase 1 is deliberately mechanical** (intended for a smaller model). **Phase 2 needs
judgment** (intended for Opus). There is an explicit STOP POINT between them — do not
cross it.

## Ground rules (apply to every step)

- One logical change per commit. Before each commit: `npx tsc --noEmit` (if the step
  touched TS) and `npx vitest run` must be green. Follow the existing commit style
  (`git log` — short imperative subject, body with what/why, a "Validated:" line,
  Co-Authored-By trailer).
- Push to `origin/main` after each clean commit. If a push fails, report and stop —
  never force-push.
- Git ops on this repo print ~16 lines of `Permission denied` worktree spam (Google
  Drive holds handles). **Expected and cosmetic** — ignore it, never try to prune.
- `tools/loopify-scenes.py` needs ffmpeg/ffprobe on PATH. Run it with
  `python tools/loopify-scenes.py` from the repo root.
- Any commit that changes shipped audio bytes under `public/audio/` must bump
  `CACHE_VERSION` in `public/sw.js` **in the same commit** (else clients keep serving
  the old cached audio).
- Scene invariants (do not violate while editing): loop offsets only from
  {251, 409, 521, 691, 887}; every variant file's length == its element's
  `loopOffsetSeconds`; ≥2 elements per scene; Opus output is 48 kHz (libopus
  rejects 44.1 kHz).

---

## Phase 1 — mechanical fixes (Sonnet-safe)

### S1. UTF-8 everywhere in loopify-scenes.py  ⟶ root cause of the mojibake

**Finding:** every `json.load(open(f))` / `json.dump(..., open(f, "w"))` in
`tools/loopify-scenes.py` uses the platform-default encoding — **cp1252 on Windows**.
Reading a UTF-8 scene JSON through cp1252 turned em dashes (`—`, bytes `E2 80 94`)
into `â€"`, which `json.dump` then escaped as `â€”` and committed
(see S4). Every re-run on Windows re-corrupts.

**Fix:** add `encoding="utf-8"` to **all five** `open()` calls:
- line 123 `json.load(open(old_sc))`
- line 134 `json.dump(j, open(sc, "w"), indent=2)`
- line 174 `json.dump({...}, open(sc, "w"), indent=2)`
- line 183 `d = json.load(open(f))`
- line 204 `json.dump(d, open(f, "w"), indent=2)`

Leave `ensure_ascii` at its default (True) — pure-ASCII escaped output is deliberate
and immune to future encoding accidents; the bug was on the **read** side.

**Acceptance:** `python - <<'EOF'` snippet round-tripping a JSON containing `—`
through the same open pattern preserves it; or simply verify after S4 + the Phase-1
idempotency check that no `â` sequences reappear.

- [x] S1 committed + pushed

### S2. gen_beds(): skip when beds exist; seed the noise source

**Finding:** `gen_beds()` (`tools/loopify-scenes.py:139-176`) runs unconditionally on
every invocation (line 209) and `anoisesrc` (line 158) is unseeded — so every run
regenerates ~29 MB of byte-different `public/audio/_bed/*.opus` even when nothing
changed. Pure binary churn on a Google-Drive-synced, git-tracked repo.

**Fix (both parts):**
1. **Skip guard (primary):** at the top of the per-color loop, if
   `<color>.opus` exists AND its probed duration is within 2 s of `BED_LENGTH`,
   print a `skip` line and `continue`. Add a `--force-beds` CLI flag
   (`argparse` or a simple `"--force-beds" in sys.argv`) to override.
2. **Seed (secondary):** add a fixed seed to the lavfi source, e.g.
   `anoisesrc=d=...:c={color}:a=0.9:r={OPUS_SR}:seed=471102`, so even forced
   regeneration is deterministic.

**Acceptance:** run `python tools/loopify-scenes.py` twice; second run prints `skip`
for all three beds and `git status` shows no `_bed/*.opus` changes. (Note: the FIRST
run after adding the seed WILL regenerate the beds once — that's fine; include the
new bed files and the `CACHE_VERSION` bump in this commit. If you'd rather avoid
touching audio bytes, add the skip guard first so the seeded path never runs — but
then the seed is unverified; prefer the one-time regeneration.)

- [x] S2 committed + pushed (with CACHE_VERSION bump if bed bytes changed)

### S3. Truthful sidecar metadata (48 kHz, not 44.1)

**Finding:** the beds are rendered at `OPUS_SR = 48000`, but their sidecars claim
otherwise — `gen_beds()` hardcodes `"outputFormat": f"44.1 kHz / {OUTPUT_BITRATE} /
stereo Opus"` (line 168), and the three committed sidecars
`public/audio/_bed/{brown,pink,white}.json` carry that false string. Separately,
`update_sidecar()` line 125 only string-swaps `"MP3" -> "Opus"` in whatever
`outputFormat` was there before, so migrated variants keep stale rate text too.

**Fix:**
1. Line 168: `f"48 kHz / {OUTPUT_BITRATE} / stereo Opus"` (or derive:
   `f"{OPUS_SR // 1000} kHz / ..."`).
2. Line 125: stop patching the old string — set it outright:
   `j["outputFormat"] = f"{OPUS_SR // 1000} kHz / {OUTPUT_BITRATE} / stereo Opus"`
   (the file at this point IS a 48 kHz stereo Opus render; saying so is always true).
3. Hand-edit the three `_bed/*.json` sidecars: `44.1 kHz` → `48 kHz`.
4. Sweep for other stale claims: `grep -rn "44.1" public/audio/**/*.json` — any
   sidecar whose sibling audio file is `.opus` should say 48 kHz; fix those too.
   (Sidecars for still-`.mp3` files are allowed to say 44.1 kHz — they're true.)

**Acceptance:** grep from step 4 returns no `.opus`-sidecar hits; `npx vitest run`
green.

- [x] S3 committed + pushed

### S4. Repair the committed mojibake (12 occurrences, 5 scene JSONs)

**Finding:** commit ae3c357 (run through the cp1252 bug in S1) committed literal
`â€”` escape sequences — mojibake for an em dash — into:

| file | occurrences |
|---|---|
| `public/scenes/forest-night.json` | 4 |
| `public/scenes/forest-evening.json` | 2 |
| `public/scenes/monsoon.json` | 2 |
| `public/scenes/forest-day.json` | 2 |
| `public/scenes/ocean-night.json` | 2 |

These render to users as `â€"` in any attribution/description surface.

**Fix:** in each file, replace the literal text `â€”` with `—`
(the correct escaped em dash — matches the style already used elsewhere in these
files, e.g. forest-night.json line 4). **Do S1 first** or a later tool run may
re-corrupt.

**Acceptance:** `grep -rn 'u00e2' public/` returns nothing; `npx vitest run` green.
May share a commit with S5 (same repair-of-ae3c357 rationale) or land separately.

- [x] S4 committed + pushed

### S5. Fix stale attributions on forest-night's wind variants

**Finding:** `public/scenes/forest-night.json` wind variants (lines 42-51) point at
`/audio/forest-day/wind-in-leaves/wind-{1,2}.opus` but still credit
"Pixabay" / "User-provided". Those files were replaced with George Vlad / Mindful
Audio cuts in ae3c357 — the attributions are now wrong. (Ledger-only today — no UI
renders attribution — but it's a licensing record and must be true.)

**Fix:**
1. Read `/public/audio/forest-day/wind-in-leaves/wind-1.json` and `wind-2.json` —
   the sidecars are the source of truth for what the files actually are.
2. Rewrite the two `attribution` strings in `forest-night.json` to match (keep the
   "Reused across forest-day and forest-night." tail — it's true and load-bearing
   for Phase 2 step O3).
3. Check `forest-day.json`'s own wind attributions for the same staleness; fix if so.

**Acceptance:** attributions agree with sidecar `source` fields; `npx vitest run` green.

- [x] S5 committed + pushed

### S6. Crash-safe write ordering in loopify_scenes()

**Finding:** `loopify_in_place()` deletes the source file (line 107 `os.remove(path)`)
immediately after conversion, but the scene JSON that references it is only rewritten
once, **after the whole scene finishes** (line 204). A crash / Ctrl-C / ffmpeg failure
mid-scene strands the scene JSON pointing at deleted files — the app 404s and there
is no self-repair (a re-run sees `MISSING` and skips).

**Fix — reorder so the JSON never points at a file that doesn't exist:**
1. In `loopify_in_place()`: **stop deleting the old file there.** Return the new
   `opus_path`; move the `os.remove(path)` decision to the caller.
2. In `loopify_scenes()`, per variant, on successful conversion:
   a. `update_sidecar(...)` (as now);
   b. rewrite `v["url"]` and immediately `json.dump` the whole scene JSON
      (yes, per variant — it's tiny);
   c. **only then** delete the old audio file (and `update_sidecar` already removes
      the old sidecar).
3. Keep the prints equivalent so the operator still sees per-file progress.
   Keep everything ASCII (see the line-104 comment — a fancy arrow crashed a run).

**Acceptance:** re-run `python tools/loopify-scenes.py` — output identical to before
(all skips, no churn); `npx vitest run` green. Reason through the crash windows: at
every point between two statements, the scene JSON must reference an existing file.

- [x] S6 committed + pushed

### S7. Contract test: missing sidecar must fail, not warn

**Finding:** `src/audio/sceneCatalogue.test.ts:135-141` — when a variant has no
sidecar (`sidecarDuration()` null), the length assertion is **skipped with a soft
warning**. A wrong-length file (which breaks the incommensurate-loops math — the
core audio design) passes the suite just by lacking a sidecar. The warnings reporter
(lines 183-191) never fails.

**Fix:** make a missing/duration-less sidecar a **hard failure** for every variant:
replace the `warnings.push(...); continue;` branch with an assertion, e.g.
`expect(duration, `${scene.id}/${el.id}/${variant.id}: no sidecar duration — every
variant needs a sidecar with trimmedTo`).not.toBeNull();`.
Run the suite: if any existing variant lacks a sidecar, **create the missing sidecar**
(probe the real duration with ffprobe and write `{"trimmedTo": "<N>s", ...}` alongside
the audio file, following an existing sidecar as the template) rather than weakening
the test back.

**Acceptance:** `npx vitest run` green with the hard assertion in place.

- [x] S7 committed + pushed

### Phase-1 exit check

- [x] `python tools/loopify-scenes.py` run twice back-to-back: second run is all
      `skip` lines and `git status` is clean (no churn — this proves S1/S2/S6
      together).
- [x] `npx vitest run` and `npx tsc --noEmit` green.
- [x] `grep -rn 'u00e2' public/` empty; `grep -rn "44.1" public/audio/**/*.json`
      has no `.opus`-sidecar hits.
- [x] All Phase-1 commits pushed: `git rev-list --left-right --count
      origin/main...HEAD` shows `0 0`.

---

## ■■■ STOP POINT — DO NOT CONTINUE PAST THIS LINE ■■■

**If you are the model executing Phase 1: stop here.** Check off the Phase-1 boxes
above, commit this file's checkbox updates, push, and end your turn with a short
status report. Do **not** start Phase 2 — the user will switch the session to Opus
first. Phase 2 items involve design decisions and subtle Howler-internals work that
are out of scope for this phase, and O3 re-encodes shipped audio.

---

## Phase 2 — judgment work (Opus)

### O1. `hasFadedIn` replay branch cancels a running sleep-timer fade  ⟶ most severe finding

**Finding (CONFIRMED):** `src/audio/howl/HowlScene.ts:136` — the replay branch added
to fix the "background got loud" bug calls `this.howl.volume(this.effective())` when
the html5 element re-fires `play`. Howler's `volume()` setter **cancels any running
fade** (`_stopFade`, howler.js ~line 1266). Constructible path: sleep timer fires →
`fadeToSilence(...)` starts the long fade-out → user's phone re-fires `play` (lock-
screen resume via the MediaSession handlers in `HowlScenePlayer.ts:224-231`, or an
OS audio-focus return) → layer **snaps back to full mix volume**, then hard-cuts
when the timer's stop lands. Directly against "put me to sleep and let me stay there."

**Design decision (make it, record it in the commit body):** what should a replay
during an active fade-to-silence do? Recommended: **re-enter the fade from the
current volume over the remaining time** — the user's intent (sleep timer running)
outranks the OS event. Alternative (simpler, defensible): leave volume untouched
when a silence-fade is active.

**Implementation sketch (recommended option):**
- Track fade state in `HowlLayer`: on `fadeToSilence(s)` / `fadeAndDispose(s)`,
  record `silenceFadeEndsAt = now + s*1000`; clear it in `restore()` and
  `setVolume()` (an explicit user action supersedes the fade — check how
  `HowlScenePlayer` uses `restore()` on timer cancel to be sure clearing is right).
- In the replay branch (line 126-137): if a silence fade is active, re-issue
  `this.howl.fade(this.currentVolume(), 0, remainingMs)` instead of
  `volume(effective())`. Note a *paused* element's clock stopped — recompute
  remaining from wall time, which errs toward finishing on the user's schedule.
- Mind `setOuter()` (line 183-186): it also calls `volume()` and would likewise
  cancel a running fade — Night Drift's gain changes can fire mid-fade. Decide
  whether to guard it the same way (probably yes: skip or re-issue while a
  silence-fade is active).
- Add a regression test alongside the existing HowlScene tests (they inject a fake
  `HowlFactory` — model the fade-cancel-on-volume() semantics in the fake, else the
  test can't catch this class of bug).

- [x] O1 committed + pushed

### O2. Howler `format` array is positional, not a fallback list  ⟶ every layer silent on iOS Safari

**Finding (CONFIRMED, latent):** `src/audio/howl/HowlScene.ts:77` passes
`format: ['opus', 'mp3', 'wav']` with a **single-element `src`**. In Howler,
`format[i]` pairs with `src[i]` (howler.js 672-677) — it is not a fallback chain.
So every layer, including `.mp3` ones, is treated as **opus** and gated on
`canPlayType('audio/ogg; codecs="opus"')` (howler.js line 277). Chromium/Firefox
pass, so nothing is wrong today — but Safari/iOS returns `""` and every scene
starts **silent**. This ambushes roadmap item 5.2 (device pass) and iOS is the
long-term target platform.

**Fix:** derive the format from each src's real extension —
`format: [src[0].split('.').pop()]` (guard for querystring-less clean paths, which
ours are) — or drop `format` entirely and let Howler infer from the URL extension
(it does; verify against howler.js `_load`). Prefer the explicit per-src derivation:
it keeps working if a CDN/query-string ever obscures the extension. Keep accepting
mp3 + opus until the migration (O3) completes.

**Acceptance:** unit test that the factory receives the extension-matched format for
an `.mp3` src and an `.opus` src; `npx vitest run` green. Real verification lands
with roadmap 5.2 on-device.

- [x] O2 committed + pushed

### O3. Unblock the MP3→Opus migration — two coupled fixes that MUST land together

**Finding A (CONFIRMED):** `tools/loopify-scenes.py:96` — the too-short guard
(`if d < period + C: WARN, return None`) fires for every already-trimmed,
exact-prime-length MP3. All **21 remaining MP3 variant URLs** (across forest-day,
forest-evening, forest-night, monsoon, ocean-night, rain-on-window, singing-bowl)
are exactly period-length, so the docstring's promised in-place migration (lines
31-34) is unreachable for every file that actually needs it.

**Finding B (PLAUSIBLE latent trap):** `forest-night.json` shares files across
scenes — its creek variants point at `/audio/forest-day/creek-trickle/creek-{1,2}.mp3`
and its wind at forest-day paths. `loopify_scenes()` rewrites URLs **only in the
scene JSON being iterated**. The moment Finding A is fixed, migrating forest-day's
creek deletes `creek-{1,2}.mp3` and rewrites only `forest-day.json` —
**forest-night 404s.** (This exact class already bit once: the wind URLs needed a
hand-patch in ae3c357.) Fix A without fix B and the trap fires on the first run.

**Fix (one commit for the tool changes):**
1. **Transcode path for exact-length files:** in `loopify_in_place()`, when
   `not already_opus and abs(d - period) < 2`, don't re-trim (the file is already a
   seamless loop) — plain transcode:
   `ffmpeg -y -i <mp3> -ac 2 -ar 48000 -c:a libopus -b:a {OUTPUT_BITRATE} <opus>`,
   then the normal rename/sidecar/URL flow. Keep the too-short WARN for files that
   are genuinely shorter than period.
2. **Global URL rewrite:** restructure `loopify_scenes()` to load **all** scene
   JSONs first and build a map `audio path → [(scene dict, variant dict), ...]`;
   process each unique file once; on rename, rewrite the URL in **every** referencing
   variant and dump **every** dirty scene JSON before deleting the old file
   (preserving S6's crash-safe ordering).
3. **Run the migration:** `python tools/loopify-scenes.py`. Verify: all 21 MP3s now
   `.opus`; `grep -rn '\.mp3' public/scenes/` empty; `npx vitest run` green (S7's
   hard sidecar check now covers every migrated file); second run is all-skip with
   clean `git status`.
4. **Migration commit:** the audio bytes + scene JSONs + sidecars + **CACHE_VERSION
   bump in `public/sw.js`**, in one commit.
5. Optional follow-through, separate commit: once zero MP3s remain, drop `mp3` from
   the accepted formats in `HowlScene.ts` and the sidecar regex in
   `sceneCatalogue.test.ts:70` — or leave both during the audition window; note the
   choice.

**Timing note for the operator:** step 3 re-encodes shipped audio for the 7 scenes
still on MP3. It does not touch the 28 fresh audition cuts (already Opus), so it does
not conflict with Andrew's pending ear audition — but if in doubt, land fixes 1-2 and
ask before running step 3.

- [x] O3 tool fixes committed + pushed
- [x] O3 migration run + committed (with CACHE_VERSION bump) + pushed

### Phase-2 exit check

- [x] `npx vitest run` + `npx tsc --noEmit` green; all commits pushed (`git rev-list
      --left-right --count origin/main...HEAD` → `0 0`).
- [x] `python tools/loopify-scenes.py` idempotent (all skip, no churn).
- [x] Update `.handoff/SESSION-HANDOFF.md` / `NEXT_STEPS.md` (if present) to reflect
      review-fix completion; remaining v1.0 gates are unchanged: ear audition,
      photos (4.3), meditation catalogue (6.5), device pass + tag (5.2).

## Findings ↔ steps cross-reference

| # | Finding (severity order from the review) | Step |
|---|---|---|
| 1 | hasFadedIn replay cancels sleep-timer fade → full-volume snap + hard cut | O1 |
| 2 | cp1252 JSON round-trip; mojibake committed in 5 scene JSONs | S1 + S4 |
| 3 | Howler format list positional → all layers opus-gated; iOS Safari silent | O2 |
| 4 | Too-short guard makes documented MP3→Opus migration unreachable | O3 |
| 5 | Crash mid-scene strands scene JSON pointing at deleted files | S6 |
| 6 | Cross-scene file sharing: rename breaks non-iterated referencing scenes | O3 |
| 7 | Missing sidecar downgrades the length contract to a warning | S7 |
| 8 | gen_beds(): unconditional, unseeded → ~29 MB binary churn per run | S2 |
| 9 | False "44.1 kHz" sidecar metadata; fragile MP3→Opus string swap | S3 |
| 10 | Stale Pixabay/User-provided attributions on forest-night wind | S5 |
