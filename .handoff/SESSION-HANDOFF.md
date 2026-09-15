# Session hand-off — 2026-09-15 (machine: tikiserv)
# Newest block. Everything below is prior history; this supersedes it for
# REPO STATE.

## STATE
- `main` at the tip of this block's commits, clean, pushed, single worktree.
  No PRs in this repo.
- Green: `npx tsc --noEmit` clean, `npx eslint src` clean, `npx vitest run`
  **287/287**, `npm run build` clean. The count fell from 360 because the
  deleted code's tests went with it; 14 new tests were added.
- **Ten scenes now.** No existing audio bytes changed, so CACHE_VERSION
  stays v13 — `/audio/` is cache-first and the four new files are fetched
  on first play.
- On tikiserv, prefix tool-shell commands with `source ~/.nvm/nvm.sh`.

## Three things got done this session
1. **PENDING-DECISIONS 0C** — the in-app generator, stripped in full.
2. **The train scene** — cut, voiced and shipped as `night-train`.
3. **The singing bowls, rebuilt** — the catalogue's three worst seams.

## Done this session: PENDING-DECISIONS 0C, the whole thing
The in-app story generator is gone. It was decided on 2026-09-12 and had
been sitting undone through three sessions of voice work. Five commits,
each revertible on its own, **3,612 lines deleted against 305 added**:

1. `6b945f7` the generator screen, the `storyGenerator` service and its 67
   tests, the route, the Library's Generate call-to-action, and `isBedtime`
   (which only ever greyed that button out between 9pm and 6am).
2. `9ea6f2b` the generated-story read path, `src/storage/assets.ts`,
   `storyExcerpt`, the fake-IndexedDB test helper — **and the database
   itself**.
3. `c8f5b69` the Settings "AI features" section, `src/storage/apiKeys.ts`,
   both keys in `UserSettings`, and the three `VITE_` variables in
   `.env.example`.
4. `7f418ed` the content blob-URL bookkeeping in `App`, which could no
   longer fire now that every `ContentItem` is a path under `public/`.
5. `2607a5c` the README's claim that the app generates anything.

**The app now makes no network call to any AI service at runtime.** It
fetches JSON indexes and audio from its own origin and nothing else. The
four bundled stories and every meditation are untouched — they were always
files in `public/`.

## Two things Andrew will notice, both intended
- **His generated stories will be gone on next app open.**
  `dropGeneratedStoryDatabase()` in `src/storage/persistence.ts` deletes the
  `sleep-app` IndexedDB on every launch. This is his call, quoted in 0C: "I
  don't love the generated ones on my phone, they can disappear." Leaving the
  database would have stranded 25-40 MB of WAV per story with nothing able to
  reclaim it. It reports `deleted` vs `absent` into the lifecycle log, so the
  Diagnostics panel will show which happened.
- **Settings has no API-key fields any more.** Nothing read them. His
  `.env.local` on this box still holds real values for the two removed
  variables — live keys on disk that nothing uses.

## Deliberately not touched
- `tools/gen-story.ts` and `tools/gen-meditation.ts` still exist and still
  work. They are the desk-side path that renders the library, and they read
  `ANTHROPIC_API_KEY` / `ELEVEN_LABS_API_KEY` unprefixed from `process.env`,
  never through Vite. Fixing gen-story's five stale ElevenLabs Studio
  endpoints is still on the list below.
- `requestPersistentStorage` survives, for a reason now written down in the
  code: it protects the service worker's audio cache, not story blobs. An
  evicted scene variant is a scene that goes silent mid-night.
- The README is stale in other ways this session did not cause (Phase 3 "in
  progress", three starter scenes). Left alone rather than quietly rewritten.

## The train scene — DONE, one thing outstanding
`night-train`: cabin 251 x2, rain-on-glass 409 (shared with rain-on-window),
distant thunder 199 x2. Pairwise coprime, conformance test green, no new soft
warnings.

- The cabin masters are **ambisonic B-format**, not a stereo pair — the
  `TRNInt-W,Y,Z,X_` filename prefix is a real layout tag and the BWF metadata
  ("ZOOM F6, Rode NTSF 1") confirms it. `level-ftus.py --layout ambix`
  handles it; the k=0.7 width was validated against the same cabin's M/S
  capture, agreeing within 2.0 dB RMS over ten octave bands.
- Wrap steps on the shipped files: **cabin 0.06 and 0.03 dB, the two
  cleanest in the catalogue**; thunder 0.00 (it wraps in silence). Trimming
  from zero would have left 13.3 and 11.3 dB.
- Checked for intrusions BEFORE shipping: faster-whisper with VAD finds zero
  speech in either cabin variant. Several neighbouring files in that FTUS
  folder are tagged "Staff Chatting" and would have put a voice on a 251 s
  metronome all night.
- **[ANDREW] The scene has no photograph** and runs on its gradient. That is
  the only thing it is missing; picking the image is your call.

## The singing bowls — rebuilt, and this one wants your ear
The audit's three worst variants were all this scene: shimmer-2 stepped
**19.0 dB** across its wrap every 409 s, drone-2 17.1, shimmer-1 10.1. All
five are now under 0.8 dB, and the catalogue goes from 12 of 71 over 3 dB
to 8.

- **The cause was slack, not material.** The shimmer stitch ran 435 s and was
  trimmed to 420 for a 409 s loop — an eleven-second window for seamfit to
  find a level-matched start in, against a bed that swells over tens of
  seconds. Stitches are now 555 s (shimmer) and 435 s (drone).
- **Levels are unchanged within 0.4 dB** of the old shipped files, so
  `defaultVolume` still means what you voiced it to mean. The scene JSON is
  byte-identical.
- **[ANDREW] What did change is dynamics.** The old build's single-pass
  loudnorm was compressing (dynamic mode — it also undershot its own target
  by 2-3 dB). With one fixed gain instead, loudness range goes 18-19 -> 23 LU
  on the drone and 15 -> 20 on the shimmer. Same integrated loudness, wider
  swings. Arguably right for a sound bath; still a judgement call on a scene
  you tuned by ear. **Say the word and it comes back out** — the old files are
  one `git revert` away.
- CACHE_VERSION **v13 -> v14**: audio bytes changed, so every install
  re-downloads.

## Next up
1. **[ANDREW] The voice audition is still waiting on ears** — 31 files on
   pixel-8-pro, `BED-*` against `BED-ELEVENLABS-stone`. Nothing downstream
   moves until a voice is picked: 7 of 10 meditation scripts are written and
   unrendered, waiting only on voice + engine.
2. Re-cut the remaining seams. After the bowl rebuild the audit reports
   **8 of 71 variants over 3 dB**, worst first: forest-evening/wind-1 at
   9.8 dB, ocean-night/wave-3 at 8.4, ocean-night/far-1 at 7.8,
   forest-evening/forest-2 at 4.6, then four between 3.5 and 3.9. These are
   field recordings, so the fix is a longer source rather than a longer
   stitch — check `~/sounds/ftus/loops` before assuming a re-cut is
   reachable. **The bowl lesson generalises: look at the slack first.**
   `assembledSeconds - loopOffset - 6` is the whole search range seamfit
   gets, and under about 30 s it cannot beat a slow swell.
3. Fix the ElevenLabs Studio endpoints in `tools/gen-story.ts` (5 paths).
4. Roadmap `[ASK]`/`[DEVICE]` items for v1.0: replace 3 off-brief photos
   (4.3) — now 4, with night-train — decide the meditation catalogue (6.5),
   device pass + tag (5.2).

## Watch out for
- **Everything in the 2026-09-14 block below still applies** — the waiter
  harness, the pgrep self-match trap, controls on every classifier, and
  "rate cannot distinguish fast from truncated".
- Deleting an IndexedDB database that does not exist **succeeds**. That is
  what makes the every-launch delete safe, but it also means a naive
  implementation reports a cleanup forever; the success event's `oldVersion`
  is the only way to tell the two apart.

---

# Session hand-off — 2026-09-14 (machine: tikiserv)
# Newest block. Everything below is prior history; this supersedes it for
# REPO STATE.

## STATE
- `main` at `4cca32e`, clean, pushed, single worktree. No PRs in this repo.
- Green: `npx tsc --noEmit` clean, `npx vitest run` **360/360**. No app code
  was touched all session — every commit is tools + notes. No audio bytes
  changed, CACHE_VERSION still v12.
- On tikiserv, prefix tool-shell commands with `source ~/.nvm/nvm.sh`.

## Two corrections to earlier drafts of this block
- **Speed was written up as a headline downside. It is not one** — see the
  audition section. Do not re-derive it as a reason to prefer a fast engine.
- The staged files **were sent** to pixel-8-pro. An earlier draft held them
  back reasoning it was after midnight; that read the box's UTC clock as
  Andrew's local time, and Taildrop does not raise notifications for him
  anyway. **The box is `Etc/UTC`; Andrew is not.** Don't use `date` on
  tikiserv to reason about his hours.

## The two open questions from 2026-09-13 are answered
1. **Kokoro vs ElevenLabs under a bed: ElevenLabs wins comfortably.** So the
   local-render question was not closed, only narrowed — Andrew asked for the
   other four engines to be tried before picking any voice, and for more
   British options.
2. **Train scene third element: distant thunder rumble**, re-cut 251 -> 199
   for coprimality. Still uncut; see "Next up".

## The stone voice is not Herzog and not German
Andrew's hypothesis was a Herzog-like accent, tuned rather than cloned.
Half right. Full write-up in `notes/voice-identity-2026-09-13.md`.
- The regional classifier passes all controls and ranks by how cleanly a
  voice sits in one accent class: synthetic British 100% of windows,
  synthetic American 88%, **stone 72% (england, with 19% voting us)**,
  real Herzog 46% across four labels. stone sits near the natives, not near
  Herzog — England-leaning with an American pull, and less "pure" than a
  clean regional voice, which supports tuned-not-cloned.
- Speaker-embedding cosine: **stone vs Herzog +0.044**, against a 0.95-0.99
  same-voice ceiling and Herzog-vs-himself-across-three-recordings at 0.80.
  stone is further from Herzog than from a generic Kokoro American (+0.238).
- **The L1 classifier with a `German` class is unusable here** and a control
  is what proved it: it scores 180 s of real Herzog as Vietnamese p=0.959,
  German p=0.011 — the same numbers it gives stone. Its 16 labels are all
  non-English L1s with no native-English escape class.

## Engine audition: built, rendered, SENT (31 files)
`notes/engine-audition-2026-09-14.md` is the full record. 31 files in
`/tmp/audition2/send`, all Taildropped to pixel-8-pro — 16 `BED-*` (under
the real rain-on-window bed, including `BED-ELEVENLABS-stone` as the
yardstick) and 15 `DRY-*`. Four engines x four references, minus XTTS's
absent default voice.

- Everything is held constant but the voice: same passage, **exactly 125.0
  wpm on every file**, 0.6 s gaps inserted by the tool, -19.5 LUFS, and
  references all normalised to -23 LUFS (they arrived 15 dB apart).
- Every render transcript-verified, 0.949-0.988 similarity, all passing.
- **Every engine tracks its reference's pace.** Chatterbox's default reads at
  235 wpm and would need a 0.53x stretch; with `stone` it runs 153.9 and
  needs 0.80x. The pace problem is its default voice, not the engine — a
  conclusion that was wrong on first measurement and only corrected by
  running the reference renders. XTTS is closest to 125 unprompted
  (129.7-150.3).
- **Speed is NOT a criterion** (Andrew, 2026-09-13). Measured Kokoro 60x
  realtime, StyleTTS2 ~2.5x, XTTS ~0.9x, Chatterbox ~0.6x, Higgs very slow —
  and it does not matter, because the library is an offline batch: "fine for
  everything else to be SLOOOOW". The only thing needing fast TTS is a
  separate webapp that reads long text aloud while he drives, where Kokoro
  stays right. For SleepApp: **voice quality first, licence second, speed not
  at all.**
- **Three of the four engines are personal-use-only** (XTTS CPML, Higgs
  Boson non-commercial, StyleTTS2's weights ship no licence at all;
  Chatterbox is MIT but watermarks every output). Fine under the brief,
  and it narrows what this app could ever become.

## New tools, all general and committed
- `tools/accent-id.py` — two classifiers over identical windows, per-window
  vote spread next to the averaged verdict. **Always pass controls**; the
  whole finding above rests on them.
- `tools/voice-similarity.py` — speaker-embedding cosine that computes its
  own same-voice ceiling and different-voice range every run, so a bare
  number is never reported alone.
- `tools/tts-audition.py` — renders any of five engines at an exact wpm by
  measuring the natural rate and pitch-preserving stretching the speech only.
  Re-execs into the engine's venv; `TTS_VENV_<ENGINE>` and `FFMPEG` override
  paths for crane-desk.
- `tools/tts-verify.py` — faster-whisper transcript check. **Rate cannot
  detect truncation**: Chatterbox measured 235 wpm and every word was there.
- `tools/tts_text.py` — the `[pause]`/`[softly]` contract, shared with
  tts-ladder so the engines cannot diverge from it.
- `tools/bedmix.py` — replaces a /tmp shell script that had the bed **9-17 dB
  hotter than the app** and loudnorm'd voice+bed together. That fixture is
  what the earlier Kokoro verdict was measured on; a too-loud bed hides more,
  so it flattered Kokoro and ElevenLabs still won. The verdict is safe, the
  fixture was not.

## Venvs (uv hardlinks, so 5 venvs cost ~10 GB not 25)
`~/venvs/{tts,accent,chatterbox,styletts2,xtts,higgs}`, all torch
2.6.0+cu124. crane-desk has `C:\venvs\higgs` (torch 2.8+cu129) and a working
ffmpeg at `C:\tools\ffmpeg\bin\ffmpeg.exe`.

## Next up
1. **[ANDREW] Listen to the staged set** and say the word to send it.
2. **Higgs is DONE and sent.** All four rendered on crane-desk in full bf16
   (10.9 GB VRAM), 140.5-167.5 wpm natural, verified **0.985-0.993, the
   highest similarity of any engine**. Its transformers port still warns some
   params were randomly initialised because they are missing from the
   checkpoint — weight it carefully despite the clean transcripts.
3. **Cut the train scene.** Cabin 251 x2 + rain-on-glass 409 + thunder 199.
   Source located: `~/sounds/ftus/TRAINS_02/.../Private Cabin ... 03` (601.7 s)
   and `... 02` (514.8 s), both 4-channel 48 kHz.
4. Re-cut the 8 reachable seams from `~/sounds/ftus/loops`.
5. Fix the ElevenLabs Studio endpoints in `tools/gen-story.ts` (5 paths).
6. Strip the in-app generator (PENDING-DECISIONS 0C).

## Watch out for
- **Never write a bare `until <cond>; do sleep; done` to wait on a job.**
  Use `~/tools/waitfor.sh <marker> <log> [timeout] [poll] [stall]` — it waits
  on a file, always carries a deadline, and exits 0 found / 2 timed out / 3
  log stopped growing. Two orphans were left running this session, and the
  pgrep-matches-itself trap below was repeated despite already being written
  down here. Check the real process before reporting a job "still running".
- **A classifier with no "none of the above" class answers confidently
  anyway.** Always run a positive control it should get right and a negative
  control it should have no class for.
- **Rate cannot distinguish "fast" from "truncated".** Only transcription can.
- `speechbrain` pulls torchaudio 2.11 built against CUDA 13 — pin torchaudio
  to match torch or it dies on `libcudart.so.13`.
- Chatterbox needs `pkg_resources`, removed in setuptools 84. Pin
  `setuptools<81`. It fails as `'NoneType' object is not callable` because
  perth swallows the ImportError.
- StyleTTS2 predates torch 2.6's `weights_only=True` default; the harness
  restores the old behaviour for the model load only.
- Disk: 98 GB total and audio working sets dominate. `~/sounds/ftus/loops`
  (18 GB) frees once the 8 seams are cut; TRAINS_02's INTERIOR is 11 GB and
  only 2 files are needed, but Andrew chose to keep the folder.

---

# Session hand-off — 2026-09-13 (machine: tikiserv)
# Newest block. Everything below is prior history; this supersedes it for
# REPO STATE.

## STATE
- `main` at `80ce638`, clean, pushed, single worktree. **No PR workflow in
  this repo** — commit straight to main (CLAUDE.md "Commit discipline").
- Green: `npx tsc --noEmit` clean, `npx vitest run` **360/360**, `npx vite
  build` clean. No audio bytes changed this session, CACHE_VERSION still v12.
- On tikiserv, prefix tool-shell commands with `source ~/.nvm/nvm.sh`.

## Shipped this session
1. **Mixer ceilings** (`maxVolume` per element + synth bed, all 9 scenes).
   Slider travel maps onto `[0, maxVolume]` = 2x the voiced default, capped
   at 1.0. Does NOT change how anything sounds — `defaultVolume` is still
   real gain. forest-night `night-ambience` re-voiced 0.30 -> 0.22 with a
   0.60 ceiling (Andrew: the crickets were too hot).
2. **Perceptual taper** (`src/audio/taper.ts`) on every volume slider —
   constant dB per unit travel, 30 dB range, true silence in the bottom 5%.
   Stored values are still real gain; the taper converts only at the edge.
   The on-screen % is now thumb position, not amplitude.
3. **The "silence until I tap around" bug** — NOT caused by the native-loop
   change (reproduced on 62a6487, before any of it). Cause: Howler registers
   its autoplay-unlock listeners lazily on first Howl construction, which
   here happens *inside* the scene-pick tap, so the unlock is deferred a
   gesture and then `load()`s every element, aborting in-flight media
   requests (`net::ERR_ABORTED`). Fixed by `primeAudioUnlock()` at startup,
   plus rebuild-on-loaderror and a bounded start retry.
4. **night-train no longer plays a forest creek** — it was paired with
   `forest-night`. Repointed to `rain-on-window` as a stopgap.

## The pace experiment — ANSWERED
Andrew listened to the 120-150 wpm ladder: **125 wpm is the pick**, and the
90 wpm "best practice" render was hated ("I want to murder the 90 wpm
narrator"). This **refutes** the research claim that sleep narration needs
<=90 wpm — see `notes/tts-research-2026-09-12.md` §4b.

His hypothesis for why, which fits the data better than the literature:
he needs enough words per second to *occupy* attention; narration he can
outpace leaves spare capacity for rumination. Consequences recorded in the
note: perceived slowness comes from **voice character** (low, gravelly,
accented) not from rate, and his hypothesis predicts he wants SHORTER
pauses, not longer — untested and directly contradicts the craft sources.

## Local TTS is set up and fast
- `~/venvs/tts` — Python 3.12, torch 2.6.0+cu124, kokoro 0.9.4, spaCy model
  pre-installed (uv venvs have no pip; Kokoro's phonemiser needs the model).
- **~60x realtime on the 4060 Ti.** 14 min of speech in 14 s.
- **Thermals are a non-issue**: 3 min sustained burn peaked 68C against an
  83C threshold, 142W of a 160W limit, zero throttling. `~/tools/gpu-watch.py`.
- `tools/tts-ladder.py` renders a story at a ladder of gross-wpm targets.
  **Known limit:** Kokoro's `speed` is discontinuous — 0.780 -> 159.7 wpm,
  0.811 -> 155.8, 0.830 -> 141.1, nothing yields ~150. The tool oscillates
  and warns rather than lying. The fix (NOT built): render once and
  pitch-preserving time-stretch to each target.

## AWAITING ANDREW'S EAR — voice audition already on his phone
15 files sent: 6 American males and 4 blends at exactly 125 wpm (same
passage, same gaps), plus 4 "under a scene bed" mixes at app levels —
including the **ElevenLabs voice given identical treatment**, to test his
hunch that Kokoro's shortfall may not matter under a bed. Also
`ELEVENLABS-stone-reference.mp3` as the dry yardstick.
Kokoro has 54 voices (28 English). Voice **blending is built in** (comma-
separated = averaged embeddings) and `speed` can be a callable over chunk
index, so the read can slow as a story progresses.

## Train scene — SOURCING COMPLETE, cutting not started
Andrew's design: **interior train ride + rain on window + one other.**
- **Rain on glass already ships** at 409s with 3 variants, full quality,
  costs nothing to reuse.
- **The thunk problem:** exterior pass-bys have no rail-joint rhythm, and no
  filter can add it. Andrew's muffling idea (lowpass + light reverb) was
  right for *tone* — he liked 1200 Hz ("light"), called 550 Hz a spaceship —
  but the rhythm has to be in the source.
- **Solved by buying FTUS TRAINS_02** (48/24 repack). On tikiserv at
  `~/sounds/ftus/TRAINS_02` (373 files, 12 GB). The target file is a
  **Thailand first-class private cabin, windows closed, "Railway Clicks",
  602 s** — two 251 s variants from one take. A 515 s second take exists.
- Because the treatment lowpasses at 1200 Hz anyway, source bandwidth above
  that is irrelevant — which is why the 24 kHz freesound interior was
  *wrongly* rejected earlier, and why 48/24 is plenty.
- **Third element still unchosen.** Suggestion on record: distant thunder
  rumble (we ship it, weather-consistent, re-cut 251 -> 199 for coprimality).

## Also on tikiserv now
- `~/sounds/ftus/loops` — **166 loop-length (>=257 s) takes, 18.3 GB**:
  76 RAIN_01, 48 WIND_02, 42 WATER_05. Short names + `manifest.csv` mapping
  back to the original filename/duration/location. Verified: count, size and
  a random duration spot-check all pass.
  These cover **8 of the 12 variants still over 3 dB** in the seam audit
  (wind-1 9.8 dB, wave-3 8.4, far-1 7.8, forest-2 4.6, rumble-2 3.8,
  birds-2 3.8, far-2 3.8, wind-2 3.5).
- `~/sounds/train-candidates` — two YouTube greps. `vXCB1zGGFiY` (Swiss
  journey, 8.5 h, 48 kHz) is a genuine continuous recording. `c5abhbJSmXY`
  is **a 27-second loop repeated for 10 hours** — delete it, and note the
  lesson: sleep-ambience uploads must be measured, not trusted.

## New machine-level tools (outside the repo, `~/tools/`)
- `gpu-watch.py` — wraps a job, reports peak temp/power/clocks and any
  throttling by cause. Encodes this box's quirks (driver 595 renamed the
  fields; this card rejects `hw_power_brake`; nvidia-smi exits 0 on a bad
  field name and poisons the whole query, so each is probed).
- `loop-detect.py` — is this audio a real recording or a short loop? Plus
  bandwidth. This is what caught the 27-second fake.

## Windows cleanup (done, with Andrew's confirmation)
Deleted from `D:\Sounds`: 16 ORTF3D zips, `picked`, `final` — **189.4 GB
freed**, all re-downloadable from Gumroad. `normalized` KEPT (it is work
product: his front-ORTF-pair + dynaudnorm output, not re-downloadable;
mirrored at `~/sounds/normalized`). The three new zips (RAIN_01, WIND_02,
WATER_05, ~39.5 GB) are extracted in two places and **safe to delete**.

## Next up
1. **[ANDREW] The voice audition on his phone** — pick a voice, and say
   whether Kokoro-under-a-bed is distinguishable from ElevenLabs-under-a-bed.
   That single answer decides whether the library can be rendered locally.
2. **Cut the train scene.** Needs a plan first (Andrew asked for plans before
   execution). Thailand cabin -> 2x 251 s variants; rain-on-glass reused at
   409; third element TBD; then `tools/loopify-scenes.py`.
3. **Re-cut the 8 reachable seams** from `~/sounds/ftus/loops`.
4. **Fix the ElevenLabs Studio endpoints** in `tools/gen-story.ts` (5 paths,
   `/v1/projects` -> `/v1/studio/projects`) — the 405 was our bug.
5. Strip the in-app generator (PENDING-DECISIONS 0C; generated stories on
   his phone may be discarded).
6. Still open from before: device night with debug markers; the native-loop
   fix is IN but unmeasured on real hardware.

## Watch out for
- **`pgrep -f <script>` matches the waiting shell itself.** A wait loop using
  it deadlocked for 1h45m doing nothing this session. Wait on a file, not a
  process name.
- **Don't edit a render tool and go straight to a 20-minute job.** Three
  separate bugs in `tts-ladder.py` each took minutes to surface. Validate on
  a 10-second input first.
- **Windows: `\\?\` works for writing but breaks `Get-ChildItem`.** Long
  paths are already enabled system-wide there, so plain paths enumerate fine.
- Marker renders and ladder renders are gitignored (`notes/marker-renders/`,
  `notes/tts-ladder/`).

---

# Session hand-off — 2026-09-11b (machine: tikiserv)
# Newest block. Everything below is prior history; this supersedes it for
# REPO STATE.

## STATE
- All work is **on `main` and pushed** (HEAD `9e74150`). No open PRs; #19
  merged, #18 closed. **This repo no longer uses a PR workflow** — commit
  straight to `main` (CLAUDE.md "Commit discipline").
- Green: `npx tsc --noEmit` clean, `npx vitest run` **343/343**, `npx vite
  build` clean. No audio bytes changed; CACHE_VERSION still v12.

## The native-loop fix is IN, and the finding was worse than suspected
Howler's html5 `loop: true` never sets the element's native `loop` — it
restarts the element from a JS timer. Measured in headless Chromium against a
2s Opus loop, timing the element's own pause->playing interval:

    bare <audio loop>          3.3 ms per wrap
    Howler loop: true         27.3 ms per wrap  (max 40.6)
    loop: false + node.loop    3.3 ms per wrap   <- now shipping

That is 27 ms of silence punched into a noise bed every 199-887 s, all night,
landing *after* the gapless wrap `loopify-scenes.py` bakes in — where the 6s
crossfade cannot cover it. **The seam work so far has been fixing the level
step and leaving the hole.** Reproduce with `tools/loop-probe/run.sh`
(committed; re-run it after any Howler upgrade — the fix reaches into
Howler's private `_sounds` and falls back deliberately if that moves).

Verified in a browser against the real factory, not a mock: native loop on,
zero Howler end/play events across six wraps, and `seek`/`volume`/`fade`/
`playing` all still behave. Also verified the nastiest hazard — Howler's
element pool never resets `loop`, so a layer that returned a looping element
would make the next borrower loop forever, plausibly a story's narration. The
factory clears it on unload and the probe confirms a recycled narration ends.

## Next up
1. **[ANDREW] One device night, now testing two things.** Turn Debug markers
   on, sleep on it, mark anything you hear. Morning: Settings -> Diagnostics
   -> Download JSON, then
   `python tools/review-markers.py <file> --measure --render`.
   This is the only way to know (a) whether the marker trigger works on a
   locked phone and (b) whether the wrap tick is actually gone on Android —
   headless Chromium on a null audio sink is not a phone speaker.
2. **[ANDREW] Then judge the seams by ear.** 12 of 67 variants are over 3 dB.
   Re-cutting them is still worth doing but was never going to fix a tick on
   its own, so judge them *after* the loop fix is on the phone. Per file:
   replace from the FTUS masters or re-cut the Vlad source? Both sets are on
   tikiserv under `~/sounds`. The 4 singing-bowl stitches want replacing.
3. Remaining v1.0 roadmap, all gated on Andrew: 3 photos (4.3), meditation
   synthesis (6.5, needs the ElevenLabs key), device pass + tag (5.2).

## Watch out for
- **Don't "simplify" `loop: false` back to `loop: true`** in
  `defaultHowlFactory`. CLAUDE.md says why.
- The `debugMarkers` setting is read once when the Player mounts, so toggling
  it while the Player is open needs a screen re-entry for the on-screen
  buttons. The lock-screen button updates immediately.
- Marker renders land in `notes/marker-renders/`, gitignored.

---

# Session hand-off — 2026-09-11 (machine: tikiserv, unattended overnight run)
# Newest block. Everything below is prior history; this supersedes it for
# REPO STATE.

## STATE (read this first)
- **MERGED to `main` 2026-09-11** (PR #19; #18 closed as superseded). The
  branch `overnight/2026-09-11` is history now.
- **Workflow change, same day: no more pull requests in this repo.** Andrew
  asked for commits straight to `main`, including unattended work. Recorded
  in CLAUDE.md "Commit discipline"; it overrides the global
  branch-and-PR default.
- Was: branch `overnight/2026-09-11`, `main` at 62a6487. Green on the branch: `npx tsc --noEmit`
  clean, `npx vitest run` **339/339** (was 270 on main), `npx vite build`
  clean. No audio bytes changed, so **no CACHE_VERSION bump** (still v12).
- Reminder: on tikiserv prefix tool-shell commands with
  `source ~/.nvm/nvm.sh` — npx is not on the non-login PATH.

## Done this session — part 1: the review's leftovers (4 commits)
The 2026-09-10 review's top four findings were already fixed on main
(60e3e95). Its DECISIONS.md entry named four more as unfixed; all four are
now done, each with regression tests:

- **SW keep-alive is reference-counted.** One on/off flag, two overlapping
  holders: play a Tonight scene, start a bare meditation over it, back out,
  and the screen's cleanup stopped the ping the scene still wanted — the
  service worker then sat dormant for the rest of the night. Holds are now
  named ('session' / 'content').
- **Media-session ownership tracks both directions.** `mediaManaged` was
  write-once, so a bed started for a story (`manageMediaSession: false`)
  left it set and the next `stopScene()` cleared the OS session out from
  under the narration that owned it — lock-screen title and transport gone
  mid-story.
- **`resume()` no longer stacks a second element.** Howler's `play()` with
  no sound id creates a NEW sound when every existing one is playing, so a
  lock-screen play tap on an already-playing scene added a second copy of
  every layer at an unrelated offset — roughly +6 dB and phasing, all
  night, with nothing tracking the extra element. Now guarded on `playing()`.
- **Settings merge stopped dropping keys.** `mergeWithDefaults` named each
  key by hand and silently dropped any it forgot; `narrationSundown` shipped
  that way, so turning it off never survived a reload. It now walks
  `DEFAULT_SETTINGS`, and the new round-trip test derives its own coverage
  so a future key can't repeat it.
- Plus one gap the same area implied: **Mixer levels are now persisted**
  (`layerVolumes`, keyed by layer id). CLAUDE.md tells you to tune the synth
  bed by ear with that slider and the tuning died with the scene. Applied as
  each layer's *initial* target, never set after `start()` — that would
  cancel the fade-in.

## Done this session — part 2: debug markers (6 commits)
`notes/debug-markers-plan-2026-09-08.md` is executed through §3.6 step 8;
see its "Execution record" section for the two departures from the plan.

- One tap records the scene, every layer's variant file, **where each layer
  is inside its loop** (read from the element's `currentTime`, never from
  elapsed-time arithmetic), the mix levels and the last lifecycle events.
- Triggers: "Mark this moment" in Nightstand (above End the night,
  deliberately quieter — mistaking it for Stop would end the night), a
  "mark" chip in Lush, and the **OS next-track action** so a headset button
  works with the phone locked. Confirmation is haptic plus one dim line;
  nothing on a black screen brightens.
- All of it behind the **`debugMarkers` setting, default off** (it puts a
  button on the lock screen). Toggling it adds/removes that button on
  whatever is already playing.
- Review in Settings → Diagnostics: per-layer file, position, distance to
  wrap, with near-wrap layers called out in text as well as colour (the
  user is colourblind). Notes can be typed after the fact. Share / Copy /
  Download text / Download JSON / Clear.
- **`tools/review-markers.py`** takes the JSON and re-renders the marked
  moment — each layer seeked to where it actually was, at the level it was
  actually playing at, mixed to one wav. `--measure` reuses
  `seamfit.wrap_step_db` so flags line up with `loopify-scenes.py --audit`.
  `--wraps` back-computes each layer's wrap times around the mark.
  Verified end to end against a fixture built from shipped forest-night
  audio (35s render, -37.4 dB mean; creek-1 measured 1.13 dB, night-5 0.80).

## Next up
1. **[ANDREW] Device pass** — plan §3.6 step 9. Turn Debug markers on, sleep
   on it, mark anything you hear, then in the morning: Settings →
   Diagnostics → Download JSON, and
   `python tools/review-markers.py <file> --measure --render`.
   This is the only thing that can confirm the feature actually works in
   the dark, on the lock screen, with real ears.
2. **Native-loop fix** (DECISIONS.md 2026-09-11 FINDING, plan §2) — its own
   branch, A/B'd with the markers. Deliberately not attempted yet.
3. **[ANDREW] Per flagged seam: replace from FTUS or re-cut Vlad?** Both
   source sets are on tikiserv under `~/sounds` (see the 2026-09-10 block),
   so either runs here. 12 of 67 variants are over 3 dB; 4 are the
   singing-bowl stitches, which want replacing rather than re-cutting.

## Watch out for
- **The Howler loop finding is unresolved and matters.** `loop: true` on an
  html5 Howl never sets the element's native `loop`; Howler restarts it from
  a JS timer (`stop().play()`), so every wrap is a gap, and the gapless 6s
  wrap `loopify-scenes.py` bakes in may be doing nothing. Full evidence with
  line numbers in DECISIONS.md. The 2026-06-15 pivot still stands — the
  element is real media the OS keeps alive — but don't repeat "the OS owns
  each loop" as if it covered looping itself. CLAUDE.md is corrected.
- Marker renders land in `notes/marker-renders/`, now gitignored.
- The `debugMarkers` setting is read once when the Player mounts, so
  toggling it while the Player is open needs a screen re-entry for the
  on-screen buttons (the lock-screen button updates immediately).

---

# Session hand-off — 2026-09-10 (machine: tikiserv)
# Newest block. Everything below is prior history; this supersedes it for
# REPO STATE.

## STATE (read this first)
- `main` at fed5c0c, clean, synced with `origin/main`. Single worktree. This
  hand-off + the plan note are on branch `handoff/2026-09-10` (PR open);
  merging is Andrew's call. Green at fed5c0c: `npx tsc --noEmit` clean,
  `npx vitest run` 263/263. (On tikiserv, prefix tool-shell commands with
  `source ~/.nvm/nvm.sh` — npx is not on the non-login PATH.)
- **tikiserv is now a full audio working box.** Both source sets are mirrored
  under `~/sounds/` (6.7 GB) and the repo's gitignored `raw-sounds` is a
  symlink to `~/sounds/raw-sounds` (excluded via `.git/info/exclude`, since
  `.gitignore`'s `raw-sounds/` only matches a directory):
  - `~/sounds/normalized/` = `D:\Sounds\normalized` (22 leveled FTUS masters
    + sidecars, 2.4 GB). Sizes verified against the desktop listing.
  - `~/sounds/raw-sounds/` = `C:\GDrive\SleepApp\raw-sounds` (741 files,
    4.4 GB): `_sources/george-vlad*` masters, `_sources/fireplace` 12 h
    FOBOS, Pixabay thunder, `new/` dump. Three sources probed to the
    durations in the audit note.
  - `D:\Sounds\picked` (26 GB raw 8-ch picks) deliberately NOT copied; pull
    only if re-leveling.
- **crane-desk is reachable by SSH from tikiserv** (OpenSSH Server installed
  2026-09-10, tailnet-only firewall, tikiserv's ed25519 key authorised,
  PowerShell login shell): `ssh -o BatchMode=yes andre@100.125.254.46`.
  Pull with `scp -r "andre@100.125.254.46:C:/path" ~/sounds/` (SFTP; no
  rsync on Windows). Send PowerShell as `-EncodedCommand` (base64 UTF-16LE);
  nested cmd quoting mangles anything with quotes. Direct WireGuard path,
  ~2.4 GB in ~3 min.

## Done this session (2026-09-08 → 09-10)
- Pulled main; re-ran `tools/loopify-scenes.py --audit`: **12 of 67 over
  3 dB**, identical to PENDING-DECISIONS 0A "still open" (4 singing-bowl
  stitches to replace; wind-1 9.8, wave-3 8.4, far-1 7.8, forest-2 4.6,
  rumble-2 3.8, birds-2 3.8, far-2 3.8, wind-2 3.5 re-cuttable). The four
  FTUS re-cuts and all waterfall-valley files wrap under 1 dB.
- Wrote `notes/debug-markers-plan-2026-09-08.md`: in-app "mark this moment"
  debug markers (replaces Andrew's stopwatch) + `tools/review-markers.py`
  design, file list, work order. PLAN ONLY — nothing implemented.
- Attempted `/code-review max` over the engine surface; it hit the monthly
  spend limit within minutes. Andrew will run it from the CLI on API tokens.
- Set up crane-desk SSH + mirrored the audio sources (above).

## FINDING — Howler's html5 loop is a JS restart, not native (unverified on device)
`new Howl({html5:true, loop:true})` never sets `<audio>.loop`. howler 2.2.4
(`node_modules/howler/dist/howler.js`) arms `setTimeout(_ended, duration)`
(:954), polls every 100 ms until the element ends (:1958), then
`stop(id,true).play(id)` and re-emits `'play'` (:1970). So every layer wrap is
a JS restart with a gap — contradicting "the OS owns each looping element" in
CLAUDE.md/DECISIONS.md, and it is the source of the replay `'play'` events
`HowlLayer.hasFadedIn` guards. Proposed fix (separate branch, after markers so
it can be A/B'd): `loop:false` + set the element's native `loop=true` on first
`'play'`. Full reasoning: plan note §2. **Ask the reviewer to confirm/refute.**

## Next up
1. **[ANDREW] Engine review from the CLI** (API tokens). In `claude` at the
   repo root:
   `/code-review max src/audio/howl src/audio/mediaSession.ts src/serviceWorker src/screens/PlayerScreen.tsx src/screens/ContentPlayerScreen.tsx src/diagnostics`
   Pose the Howler-loop question explicitly. Save findings as
   `notes/code-review-2026-09-XX/fix-plan.md` in the 2026-07-02 format.
2. Execute that fix plan (anything touching `HowlScene`/`HowlScenePlayer`
   lands before the markers).
3. Build the debug markers per plan §3.6 (engine snapshot → store → session
   `markMoment` → setting → Nightstand UI → media key → Diagnostics panel →
   review tool → Pixel pass). Branch + PR.
4. Native-loop branch, A/B'd with markers.
5. **[ANDREW] Seams, per flagged file:** replace from the FTUS masters or
   re-cut the Vlad source through `loopify-scenes.py`? Everything needed is
   now local. Singing-bowl: replace, don't re-cut.

## Open questions for Andrew
- Media-key `nexttrack` as a marker trigger (shows a "next" button on the
  lock-screen widget while the toggle is on)?
- Markers during stories/meditations too, or scenes only first?
- Native-loop fix in the markers branch or separate? (Recommend separate.)

## Watch out for
- Don't re-copy `D:\Sounds\picked` casually — 26 GB against 67 GB free.
- Files scp'd from Windows arrive read-only; `chmod -R u+w` before deleting.
- The `.handoff` "desktop-local, will not reach the laptop" note below is
  now stale for tikiserv — sources are here.

---

# Session hand-off — 2026-08-19 (machine: desktop)
# Newest block. Everything below is prior history; this supersedes it for
# REPO STATE.

## STATE (read this first)
- Branch `main`, clean, synced with `origin/main` (0/0). HEAD `5abc2de`.
  Single worktree. Everything committed, pushed, **and deployed live**.
- The FTUS audio batch is **shipped and in production** at
  andrewrausch.com/SleepApp — verified serving (scene JSON, story index and
  audio all reachable, HTTP 206 range requests working). Andrew slept on it.
  20 new scene variants across six scenes, plus two new Glen-narrated sleep
  stories. CI + Pages green on every commit.
- The one substantive discovery: **`loopify-scenes.py` trims from t=0, which
  put each source's fade-in against its settled tail** — a 10-17 dB step at
  every loop wrap, on every file we have ever cut. Fixed for this batch by
  searching a per-file start offset that matches the wrap head to its tail
  (16 of 20 now wrap within 0.0-0.5 dB). **The tool itself is unchanged** —
  see "Next up" #1, this is the most valuable thing outstanding.

## Done this session
- Pulled all 20 picks from 161 GB of FTUS Gumroad ZIPs; corrected the pull
  list's ZIP mapping (WATER splits by category: 01-02 FLOW, 03-05 SURF,
  **06 TURBULENCE+WATERFALL** — the size model had put the waterfall trio in
  WATER_01 and ruled WATER_06 out). Lesson recorded: match by filename
  category prefix, not cumulative size.
- Checked and rejected WIND_01 (right material, but 308 s max against wind
  slots needing >=415/527 s — a duration wall, not quality) and WINDOWS_01
  (motorised curtain foley, not weather).
- Measured the 47 shipped variants: the catalogue was **never uniformly
  normalised** (-18.9 to -26.1 LUFS). New files are therefore normalised to
  their destination element's median, not a global target, so `defaultVolume`
  and the mix voicing still hold.
- Processing chain per file: front ORTF pair only -> `dynaudnorm` (~40 s
  window) -> **two-pass** `loudnorm` (linear; single-pass gates and pumps on a
  long noise bed) -> seam-matched trim.
- forest-night `night-ambience` re-keyed 409 -> 199 with 3 new cricket beds
  (old two removed); everything else **added alongside** existing variants for
  A/B. forest-night still shares forest-day's creeks.
- Two stories written and rendered with **Glen** (now exposed in
  `gen-story.ts`; it was meditation-only before, leaving Stone — a meditation
  voice — as stories' only male option). Fixed `durationSeconds` for all four
  stories: it was a `words/130*60` estimate, ~10% over on every entry.
- CACHE_VERSION v9 -> v11.

## Next up
1. **Teach the seam fix to `tools/loopify-scenes.py`.** Right now it still
   trims from 0, so the 10-17 dB wrap step returns for the next file anyone
   cuts, and every *previously* shipped variant likely still has it. The
   working algorithm is in this session's scratch (`seamfit.py`): decode a
   1 kHz mono envelope, search S over [0, dur-P-6] minimising
   |L(S) - L(S+P)|, penalise candidates whose wrap regions sit >4 dB off the
   file's mean. Consider auditing the pre-existing 45 variants the same way.
2. **[ANDREW] Audition, especially forest-night.** Two known-risky files:
   `night-ambience/night-4` (#233 — 5.0 dB residual seam, LRA 15.2, crow caws
   that could metronome at the 199 s loop; `night-5` same caveat, `night-3` is
   the safe pure-chorus anchor) and `rain-pavement/pavement-3` (#656 — 4.3 dB,
   gusty). Both re-cuttable from unused regions of the same sources.
3. **[ANDREW] waterfall-valley photos.** Blocked on one answer — see
   PENDING-DECISIONS 0A/A. Scene JSON staged at
   `notes/staged/waterfall-valley.scene.json`, its 4 audio files already
   processed and in `public/audio/waterfall-valley/`. ~20 min to wire once
   photos exist. Also needs a call on its third element (0A/B).
4. Remaining v1.0 roadmap `[ASK]`/`[DEVICE]`: photos (4.3), meditation
   synthesis (6.5), device pass + tag (5.2).

## Watch out for
- **`tools/_build-level-candidates.sh` must NOT be deleted.** The 2026-08-09
  block below says it is "safe to delete" because its logic "already lives in
  `tools/loopify-scenes.py`" — **that is wrong.** loopify does no levelling at
  all (its own header: "no loudnorm on scene files"). That script is the only
  record of the dynaudnorm -> loudnorm recipe this batch used. Still untracked;
  committing it is an open question for Andrew.
- **There is no "hidden scene" state.** `sceneCatalogue.test.ts` requires
  `public/scenes/` to match `index.json` exactly, which is why waterfall-valley
  is staged under `notes/` rather than shipped unlisted.
- **ElevenLabs Projects API returned 405** on both story renders; the
  chunked-TTS fallback handled them. Projects is the documented long-form path,
  so it may be gone or moved on this plan tier — check before a longer piece.
- `gen-story.ts` still estimates `durationSeconds` from word count. Committed
  values were corrected by hand; the tool needs an ffprobe dependency to fix
  properly.
- Three old unmerged branches exist (`backup/pre-rebase-2026-05-30`,
  `claude/objective-kirch-e41ce1`, `claude/optimistic-khayyam-1e864b`), all
  from May 2026 — i.e. before the June Howler pivot. Treated as litter per
  CLAUDE.md, deliberately NOT merged. Leave for a "deferred clean-up work" pass.
- Source material lives on `D:\Sounds` (161 GB of ZIPs, `picked/` 24 GB,
  `final/` the shipped renders) — **desktop-local, will not reach the laptop.**

---

# Session hand-off — 2026-08-09 (later: code-review fix plan EXECUTED)
# This block supersedes the two below for REPO STATE. The 2026-07-02 code-review
# fix plan is now fully done and pushed. Everything below is prior history.

## STATE — code-review fix plan complete (read this first)
- Branch `main`, synced with `origin/main` (0/0), single worktree. All work
  committed + pushed; nothing stranded.
- Executed `notes/code-review-2026-07-02/fix-plan.md` end to end, both phases
  (all 18 checkboxes ticked):
  - Phase 1 (S1–S7): UTF-8 on every open() in loopify-scenes.py; bed-churn skip
    guard + seeded anoisesrc; truthful 48 kHz sidecar metadata; repaired em-dash
    mojibake in 5 scene JSONs; corrected forest-night wind attributions to George
    Vlad; crash-safe migration write-ordering; hard "missing sidecar fails" scene
    test (+ backfilled fireplace close-1 sidecar).
  - Phase 2 (O1–O3): O1 — a running sleep-timer fade is no longer cancelled by an
    element replay or a gain change (re-enters the fade over remaining wall time;
    +2 regression tests). O2 — Howler `format` derived per-src (howlFormats) so
    `.mp3` layers aren't opus-gated / iOS-silent (+3 tests). O3 — unblocked and
    RAN the MP3→Opus migration: all 7 remaining MP3 scenes now Opus (19 files
    transcoded, cross-scene forest-night creek rewrite intact), `public/sw.js`
    CACHE_VERSION v8→v9.
  - Fix commits `3c23660..883e47e` (10) + this bookkeeping commit.
  - Green: `npx tsc --noEmit` clean; `npx vitest run` 259/259 (was 254; +5 new
    regression tests). `python tools/loopify-scenes.py` is idempotent (all skip,
    clean tree, beds skipped).
  - O3 step 5 (drop `mp3` from accepted formats) intentionally LEFT during the
    ear-audition window — no `.mp3` remain, so the tolerance is harmless.
- **Remaining v1.0 gates UNCHANGED**: [ANDREW] audition the 28 refreshed cuts;
  pad/drone meditation bed (PENDING #0a); roadmap photos (4.3), meditation
  synthesis (6.5), device pass + tag (5.2).
- Untracked `tools/_build-level-candidates.sh` still left as-is (retired litter).

---

# Session hand-off — 2026-08-09 (machine: laptop)
# (The 2026-07-04 block below is STILL the accurate project state and the real
#  priority list. Today changed NOTHING in the repo and was source research only
#  — read this block, then treat the 07-04 block as the live plan.)

## STATE — 2026-08-09 (read this first)
- Branch: `main`, clean, synced with `origin/main` (0/0). Single worktree.
  HEAD `29f8991`, unchanged since the 2026-07-04 hand-off. **Nothing stranded;
  nothing new committed this session.**
- Today was an **audio-source exploration only**, done entirely OUTSIDE the repo.
  Durable output is on Drive (not git): `file-transfers/Sounds/klankbeeld-descriptions.md`
  — a 21-file klankbeeld catalogue stripped from the raw docx, with a scene-mapping
  table + analysis-derived clean-loop windows. Proof loops + audio-scope pages are
  under `%TEMP%/klank/` (laptop-local — will NOT reach the desktop).
- ⚠ **Much of today is superseded.** The project pivoted to **personal-use /
  non-commercial** (2026-06-30, memory `reference-audio-licensing`), which relaxes
  the commercial-license constraint today's CC-BY analysis was built around; and a
  **George Vlad / FOBOS clean-source refresh (28 cuts) already shipped** (`ae3c357`).
  Treat today's klankbeeld/CC-BY work as *supplementary* source research, not a new
  front. Active driver = audio QUALITY, not license.

## Done this session (2026-08-09)
- Reviewed the Free To Use Sounds license (commercial standalone → needs a paid
  Developer License). Moot under the personal-use stance; analysis retained in
  memory `reference-audio-licensing` in case commercial returns.
- Built `file-transfers/Sounds/klankbeeld-descriptions.md`: 21 klankbeeld cuts
  (all creator-labelled **CC BY 4.0**), durations/loop-fit, artifact watch-outs, a
  proposed scene map (incl. a new **Dockside/harbour** scene from the marina rigging
  clip), and clean-loop windows from an envelope/event + bird-density analysis.
- Located clean windows around flagged artifacts (the "laughing man" 17:14 in
  859878 → clean 22:44–27:03; bird-sparse forest 857747 @ 1:14–5:33) and rendered
  5 proof loops (LRA 3.6–7.3, far steadier than the old amateur files).
- Gap sourcing (CC0/CC-BY): **fireplace = visionear 501417 (CC0, 11:54, 48k/24)**;
  singing-bowl = real-CC0 layering (hollandm 573805 + strikes), synthetic drones
  rejected. NB the meditation bed has since moved to a **pad/drone** (PENDING #0a),
  so the bowl work is optional.

## Next up (2026-08-09) — unchanged from 2026-07-04
1. **Execute the code-review fix plan** — `notes/code-review-2026-07-02/fix-plan.md`
   (Phase 1 Sonnet → hard STOP → Phase 2 Opus). Most-severe: O1 `hasFadedIn`
   sleep-timer snap, O2 Howler positional `format` (iOS-silent), S1/S4 mojibake.
2. **[ANDREW — the gate] Audition the 28 refreshed cuts** —
   `raw-sounds/_scope-refresh-2026-07-01/index.html`. Listen for the cricket line
   in forest-night night-1/night-2.
3. **Build the pad/drone meditation bed** (PENDING #0a) — not singing bowls.
4. v1.0 roadmap `[ASK]`/`[DEVICE]`: photos (4.3), meditation synthesis (6.5),
   device pass + tag (5.2).

## Watch out for (2026-08-09)
- Untracked `tools/_build-level-candidates.sh` — a throwaway from the superseded
  freetousesounds LEVEL-fix batch. **CORRECTED 2026-08-19: its logic does NOT
  live in `tools/loopify-scenes.py`** — loopify does no levelling at all. That
  script is the only record of the dynaudnorm -> loudnorm recipe, which the
  2026-08-18 FTUS batch used. Do NOT delete. Still untracked.
- Today's proof loops + audio-scope live under `%TEMP%/klank/` on the LAPTOP only.
  The durable artifact is `file-transfers/Sounds/klankbeeld-descriptions.md` (on Drive).
- Don't re-open the commercial-license thread unless the personal-use decision
  reverses (memory `reference-audio-licensing`).

---

# Session hand-off — 2026-07-04 (machine: crane-desk)
# (Older 2026-06-16 → 2026-07-02 hand-off history is preserved below this
#  block — but THIS block is the current state; read it first and treat the
#  rest as backstory.)

## STATE — 2026-07-04 (read this first)
- Branch: `main`, clean, synced with `origin/main` (0/0). Only the main
  worktree exists. Everything is committed + pushed (HEAD `64c02ee`).
- **The `/code-review` is DONE and its fix plan is written to disk** —
  `notes/code-review-2026-07-02/fix-plan.md`. That closes the "run the code
  review" action from the last hand-off. The review found **10 verified
  issues** (9 confirmed, 1 latent) in the audio-refresh commits; none are
  shipped-audio-breaking today, but one (the `hasFadedIn` fade-snap) defeats
  the sleep timer and should land before the v1.0 tag.
- **Nothing has been fixed yet** — this session only *planned* the fixes. The
  plan is built to be executed by a fresh session with no context, and is
  **split into two phases with a hard STOP POINT between them**: Phase 1
  (S1–S7) is mechanical, sized for Sonnet; Phase 2 (O1–O3) needs judgment,
  sized for Opus. The model was switched to Opus at the end of this session.
- Andrew's **ear audition of the 28 refreshed cuts is still the open gate**
  (unchanged from 2026-07-02) — dashboard at
  `raw-sounds/_scope-refresh-2026-07-01/index.html`.

## Done this session (2026-07-04)
- **Ran `/code-review` (high effort)** over the audio-refresh range
  `9321c55..1369e5d`: `tools/loopify-scenes.py`, the `HowlScene.ts`
  `hasFadedIn` fix, `sceneCatalogue.test.ts`, and the scene-JSON edits.
  8 finder angles → dedup → verify → **10 findings** (9 CONFIRMED, 1
  PLAUSIBLE). Nothing committed as a fix — findings only.
- **Wrote the fix plan** (`64c02ee`): `notes/code-review-2026-07-02/fix-plan.md`.
  Every finding has a file:line anchor, the exact fix, and acceptance checks;
  ground rules (commit style, auto-push, CACHE_VERSION-on-audio, worktree spam,
  scene invariants) are restated inline so a context-free session can run it.
  Two findings are **coupled** — fixing the loopify too-short guard (O3-A)
  without the cross-scene URL rewrite (O3-B) would break forest-night's creek;
  the plan forces them into one step.

## Next up (2026-07-04)
1. **Execute the fix plan** — `notes/code-review-2026-07-02/fix-plan.md`.
   - **Phase 1 (Sonnet):** switch model to Sonnet, say "execute Phase 1 of
     the fix plan." It STOPS itself at the barrier after S1–S7.
   - **Phase 2 (Opus):** then switch to Opus and say "execute Phase 2."
   - Most-severe items: O1 (`hasFadedIn` cancels a running sleep-timer fade →
     full-volume snap + hard cut), S1+S4 (cp1252 mojibake, already committed in
     5 scene JSONs), O2 (Howler `format` list is positional, not fallback →
     every layer silent on iOS Safari — ambushes roadmap 5.2).
2. **[ANDREW — the gate] Audition the 28 cuts** (dashboard above). Listen for
   the steady cricket line in forest-night `night-1`/`night-2`. Flags → re-cut
   from the same long sources.
3. **Build the pad/drone meditation bed** — audition 99Sounds "Red Fog" →
   voice it (HPF 80–100 Hz, 200–500 Hz dip, keep 2–4 kHz clear, ~15 dB under
   narration) → loopify to a prime offset → Andrew auditions.
   (`PENDING-DECISIONS.md` #0a.)
4. Then the v1.0 roadmap `[ASK]`/`[DEVICE]` items: photos (4.3), meditation
   catalogue synthesis (6.5), device pass + tag (5.2).

## Watch out for (2026-07-04)
- **The fix plan's O3 re-encodes shipped audio** for the 7 scenes still on MP3
  (21 variant URLs — the review's "19" undercounted). It does NOT touch the 28
  fresh audition cuts (already Opus), so it won't collide with Andrew's ear
  pass — but if unsure, land O3's tool fixes and ask before running the
  migration.
- **Phase 1 → Phase 2 is a real gate, not a formality.** Phase 2's O1/O2
  involve subtle Howler-internals semantics (a `volume()` call cancels a
  running fade; the `format` array pairs positionally with `src`) that are easy
  to get wrong — don't let a small model wander past the STOP POINT.
- Everything the previous hand-off flagged still holds: the app already plays
  the NEW audio (refresh shipped ahead of the audition — fine for personal
  use); mixed `.mp3`/`.opus` in `public/audio/` is expected during migration;
  `gen_beds()` churn is real (the plan's S2 fixes it).
- `tools/_build-level-candidates.sh` (untracked) is still retired 2026-06-21
  litter — leave it or delete on a cleanup pass; not live work. A stray
  `NEXT_STEPS.md` also sits in an orphaned `.claude/worktrees/` dir (Drive
  litter, not a registered worktree — `git worktree list` shows only `main`);
  ignore it, don't hand-edit it.

---
# ARCHIVED hand-off — 2026-07-02 (crane-desk, abroad)

## STATE — 2026-07-02 (superseded by the block above)
- Branch: `main`, clean, synced with `origin/main` (0/0). Only the main
  worktree exists. Everything below is committed + pushed (HEAD `1369e5d`).
- The **clean-source audio refresh is CUT and LIVE on main**: 28 new George
  Vlad / FOBOS cuts across 6 scenes, all Opus on their prime offsets, tests
  254/254 green, SW cache bumped v7→v8. The one gate left is **Andrew's ear
  audition** (dashboard ready, see Next up #1). Also decided this session:
  **warm pad/drone is the default meditation bed** (supersedes singing bowls).

## Done this session (2026-07-01 → 02)
- **Pad/drone decision recorded** (`149d951`, DECISIONS.md + PENDING-DECISIONS
  0a): default meditation bed = warm ambient pad/drone. Build route: audition
  **99Sounds "Red Fog"** (free drone library) first, numpy/ffmpeg DSP synthesis
  as fallback; MusicGen stays rejected (failed by ear on bowls 2026-06-21).
  Bowls demoted to optional later texture (11 real recordings kept in
  `raw-sounds/`).
- **Loop-cut the sourced audio** (`ae3c357`): 28 cuts from
  `raw-sounds/_sources/` into `public/audio/<scene>/<element>/` — forest-day,
  forest-night (gained a proper 3rd element: night insects @409, African night
  source), forest-evening, monsoon (re-described as rainforest), ocean-night,
  fireplace. Pipeline: ffmpeg region cut → loudnorm I=-20 (distant layers also
  lowpassed 2800/3500 Hz) → FLAC intermediate → `loopify-scenes.py` → Opus at
  exact prime lengths. Sidecars written, 26 replaced MP3s deleted,
  `CACHE_VERSION` v8. Kept unchanged (no clean source yet): creeks, thunder,
  dockside, rain-on-window, singing-bowl.
- **loopify tool fixes** (`20bca82`): dropped the obsolete forest-evening copy
  job (was littering unreferenced files); ASCII-only prints (a `→` crashed the
  run mid-migration on Windows' cp1252 console).
- **Removed orphaned fireplace `distant-3`** (`1369e5d`) — unreferenced since
  May, surfaced when the audition dashboard counted 29 tracks instead of 28.
- **Audition dashboard built + opened**:
  `raw-sounds/_scope-refresh-2026-07-01/index.html` (28 tracks, spectrogram +
  scrubber each).

## Next up (2026-07-02)
1. **[ANDREW — the gate] Audition the 28 cuts** in the dashboard above. Ears
   only — spectrograms looked clean. One thing to listen for: forest-night
   `night-1`/`night-2` carry a steady single-frequency cricket line (authentic,
   but could read as "whine" at low volume). Flags → re-cut different regions
   from the same sources (they're 1–12 h long, plenty of material).
2. **Run `/code-review` over the recent changes** (Andrew asked for this,
   not yet run): `tools/loopify-scenes.py`, the `HowlScene.ts` `hasFadedIn`
   fix, `sceneCatalogue.test.ts`, this session's scene-JSON edits. Known item
   to weigh: `gen_beds()` regenerates the noise beds UNSEEDED on every run —
   pure binary churn when nothing changed (this session discarded it via
   `git checkout -- public/audio/_bed/`). Consider seeding or a skip-if-exists.
3. **Build the pad/drone meditation bed**: download/audition 99Sounds
   "Red Fog" → pick a candidate → voice it (HPF 80–100 Hz, 200–500 Hz dip,
   keep 2–4 kHz clear, ~15 dB under narration) → cut to a prime offset via
   the loopify pipeline → Andrew auditions.
4. Then back to the v1.0 roadmap `[ASK]`/`[DEVICE]` items: photos (4.3),
   meditation catalogue synthesis (6.5), device pass + tag (5.2).

## Watch out for (2026-07-02)
- **The app is already playing the NEW audio** — the refresh shipped before
  the ear audition (fine for a personal-use app; the dashboard is the formal
  gate, and re-cuts are cheap).
- **B1–B4 loop-seam bugs (2026-06-17) are probably mooted** by this refresh —
  forest-night wind and all ocean waves were replaced wholesale with new
  sources and the gapless fade-wrap method. Confirm during the audition, then
  close them in PENDING-DECISIONS §5.
- `gen_beds()` non-idempotency (Next up #2) — if you re-run
  `loopify-scenes.py` and only `public/audio/_bed/` shows as modified, that's
  the unseeded-noise churn; safe to `git checkout --` it.
- `tools/_build-level-candidates.sh` (untracked) + `raw-sounds/_candidates/`
  are still the retired 2026-06-21 litter — delete on a cleanup pass.
- Mixed `.mp3`/`.opus` in `public/audio/` is expected and supported during the
  scene-by-scene migration; don't "fix" it.

---
# ARCHIVED hand-off — 2026-07-01 (crane-desk, abroad)

## STATE — 2026-07-01 (superseded by the block above)
- Branch: `main`, clean, synced with `origin/main` (0/0). Only the main
  worktree exists. All work below is committed + pushed.
- The **clean-source audio refresh** is the active workstream. This session
  built the Opus pipeline, sourced 2 of 3 remaining scene gaps, fixed a real
  playback bug, and surfaced one decision that's waiting on Andrew.

## Done this session (2026-07-01)
- **Opus pipeline built + verified.** `tools/loopify-scenes.py` now emits Opus
  (libopus @ 48kHz — 44.1kHz is invalid for libopus, which broke the first
  run), converts any input format, and self-migrates a scene's JSON+sidecar
  to `.opus`. `HowlScene.ts` + `sceneCatalogue.test.ts` accept both `.mp3` and
  `.opus` for a scene-by-scene migration. 3 synth beds regenerated. 254/254
  tests pass, typecheck clean. (DECISIONS.md "Ship scene audio as Opus".)
- **Sourced 2 of 3 audio gaps** (both Opus, in `raw-sounds/_sources/`, gitignored):
  - **Ocean** — 2× George Vlad ~1h calm recordings (sandy + rocky Madagascar),
    `george-vlad-ocean/`. (Research wrongly said Vlad had no ocean — his *free
    YouTube* has it; found by direct search.)
  - **Fireplace** — 12h FOBOS PLANET source, `fireplace/` (818MB).
  - (Earlier: 10× George Vlad forest/rain/wind, `george-vlad/`, 656MB.)
- **Fixed a real playback bug** — `HowlLayer` re-faded from silence on every
  element replay (not just first), which could read as "background suddenly
  got loud." Guarded + regression test. NOT device-confirmed as THE cause of
  Andrew's report (see DECISIONS.md 2026-07-01 entry).
- **YouTube "throttle" was a false alarm** — it was `--download-sections` on
  test grabs, not a real limit. Whole-file grabs are full-speed. (Corrected in
  DECISIONS.md; don't re-investigate.)

## Next up (2026-07-01)
1. **[DECISION — Andrew] Meditation bed: singing bowls vs. warm pad/drone.**
   Research recommends switching the *default* meditation bed from the
   singing-bowl sound bath to a warm ambient pad/drone (bowl evidence is all
   passive standalone listening; pad/drone is what serves voice-over). This
   would supersede the 2026-06-30 singing-bowl-via-ElevenLabs-Music plan.
   **Hold the singing-bowl rebuild until Andrew rules.** (DECISIONS.md
   "OPEN RECOMMENDATION — meditation bed", PENDING-DECISIONS.)
2. **Loop-cut the sourced audio into `public/audio/`.** The mechanical core of
   the refresh, not yet started: place clips from `raw-sounds/_sources/` into
   the right `<scene>/<element>/` folders and run `loopify-scenes.py` per
   scene, then audition. Covers forest/rain/wind (Vlad), ocean (Vlad), and
   fireplace (FOBOS). Bump `CACHE_VERSION` in `public/sw.js` after.
3. **Audition everything by ear** before committing to `public/audio/` — the
   whole point of this refresh is cleanliness that spectrograms don't verify.
4. **Optional:** Freesound login if you want the CC0 Courter fireplace as a
   second variant (Andrew offered).

## Watch out for
- Nothing is loop-cut into `public/audio/` yet — the pipeline is ready but
  hasn't been pointed at the new source material. The app still plays the OLD
  (dirty) scene audio until that happens.
- `tools/_build-level-candidates.sh` (untracked) + `raw-sounds/_candidates/`
  are RETIRED litter from the superseded 2026-06-21 batch — ignore/delete on a
  cleanup pass; don't mistake for live work.
- Opus is scene-audio only; meditations/stories stay MP3/WAV (decided, not a
  TODO). iOS still deferred — verify Opus-in-`<audio>` before iOS ships.
- Leftover tooling from the throttle false-trail (Deno, bgutil provider) is
  harmless; leave installed.

## LEFTOVER WORK reconciled 2026-06-30 (read this first)
This hand-off was written *before* the scene-audio re-cut batch was touched. A
later stretch of the 2026-06-21 session (18:26–18:31, after the 18:02 hand-off
commit) **built the LEVEL slice of that batch** and never recorded it. So:
- 3 finished LEVEL candidates (ocean wave-1/wave-2, fireplace close-3), each a
  verified 251.000s seamless loop, plus an `AB/` compare set and a `scope/`
  audition dashboard, sit in `raw-sounds/_candidates/scene-audio-2026-06-21/`
  (gitignored, intact — nothing lost). Built by untracked, not-for-commit
  `tools/_build-level-candidates.sh`.
- **RETIRED 2026-06-30** — do NOT audition or promote them. The whole
  2026-06-21 re-cut batch is superseded by the clean-source refresh (we're
  redoing the audio wholesale from a new producer); these candidates and the
  rest of `_candidates/` are now just cleanup litter. See `PENDING-DECISIONS.md`
  #0a for the governing direction. Kept this note only so the build isn't
  rediscovered and mistaken for live work.

## STATE (read this first)
- Branch: `main`, clean, synced with `origin/main`. Ahead/behind 0/0.
- This was mostly a catch-up + content session. Caught up on the big
  **Howler html5 audio pivot** that landed via cloud PRs #7–#13 (the
  overnight-death problem is **solved** — 6h overnight confirmed), then did
  two pieces of follow-up: reconciled `CLAUDE.md` to the new engine, and
  expanded the **meditation catalogue from 3 to 10** by hand-writing 7 new
  scripts. The scripts are committed; their **audio is not generated yet** —
  that's one open action (needs your ElevenLabs key). **Also queued and now top
  priority:** a scene-audio re-cut batch — Andrew listened through all 44 layers
  on 2026-06-21 and flagged 15 (incl. rebuilding singing-bowl from real
  recordings); see PENDING-DECISIONS #0 + `notes/scene-audio-flags-2026-06-21.md`.

## Done this session
- **Caught up on the Howler pivot** (PRs #12/#13): production scene bed now
  runs through Howler `html5` (`src/audio/howl/`), OS owns each loop; the old
  Web Audio keep-alive/element-sink/watchdog stack is gone. Web Audio engine
  retained for the dev harness/tests only. (All recorded in DECISIONS.md.)
- **Reconciled `CLAUDE.md`** to that reality — commit `48c69da` (pushed).
  Scene-authoring rule #3 flipped from "variant longer than offset+crossfade"
  to "variant length **==** prime offset"; audio-engine invariants rewritten
  around `HowlScene`/`HowlScenePlayer`; file-layout + current-focus updated.
- **Closed draft PR #11** ("element-sink stall watchdog") as obsolete — it
  guarded the Web Audio path the pivot deleted.
- **Resolved roadmap 6.5**: invest in meditations (not cut). Hand-wrote 7 new
  sleep-meditation scripts (distinct techniques: PMR, 2 breath, 4
  visualization, 1 cognitive-shuffle), expanded all to ~8 min, committed
  `bb4a046`. Existing 3 scripts left unchanged.

## Also landed on main (overnight cloud build — not this session)
While this session ran, an overnight listening/build batch pushed to
`origin/main` (commits `210c363`..`56262df`); I rebased my two commits on top
of it. Status (full notes in `notes/bug-reports-2026-06-17.md`):
- **B5 done** (Forest Day birds 0.35→0.25). **B6** app-shell→`100svh` fix
  shipped, needs device-verify (not a v1.0 blocker). **B7** story-durability
  mitigations shipped — but root cause is device-dependent and it is a
  *possible data loss* (a generated story, "astronomer", vanished overnight).
- **B1–B4 are BLOCKED on source audio** — loop-seam/level defects (Forest-Night
  plane artifact, linear→equal-power loop crossfade for `loopify`, mid-clip A→B
  loop points, Ocean-Night swell seam) that need the original scene audio +
  your ears. Branch `claude/forest-night-audio-crossfade-f5w5ws` exists for
  this (no open PR). See PENDING-DECISIONS.

## Next up
0. **(NOW TOP, updated 2026-07-01) Clean-source audio refresh — in progress.**
   Sourced and downloaded: George Vlad forest/rain/wind (10 files, 656MB,
   `raw-sounds/_sources/george-vlad/`) and a 12h fireplace source (818MB,
   `raw-sounds/_sources/fireplace/`). Ocean waves still needs a source
   (leading candidate: Earth.fm "Gentle Waves over Ancient Rocks" — not yet
   fetched). Singing-bowl direction decided (ElevenLabs Music bed + the real
   bowl recordings already in `raw-sounds/`) but not yet built.
   **The Opus pipeline is ready** (`loopify-scenes.py` emits Opus, code
   accepts it, beds regenerated, tests green) but **nothing has been loop-cut
   into `public/audio/` yet** — that's the actual next mechanical step: place
   source clips into the right scene/element folders and run
   `loopify-scenes.py` per scene. Full detail in `PENDING-DECISIONS.md` #0a-0d.
   This SUPERSEDES the 2026-06-21 re-cut batch (and its LEVEL candidates —
   retired).
1. **Synthesize the meditations** (needs `ELEVEN_LABS_API_KEY`). Run the
   `gen-meditation.ts --script ...` commands in `PENDING-DECISIONS.md` #1 —
   re-render the 3 existing + generate the 7 new — and QC the voices.
2. **After synthesis (my part):** bump `CACHE_VERSION` in `public/sw.js`
   (re-rendered 3 reuse filenames → stale cache otherwise), commit
   `public/meditations/` (MP3s + index.json), check off roadmap 6.5.
3. **Remaining v1.0 items:** 4.3 replace 3 off-brief photos `[ASK]` (you
   source images); 5.2 device pass + tag `v1.0.0` `[DEVICE]`.
4. **Self-voice clone:** once you have the cloned ElevenLabs voice ID, I wire
   it into `VOICE_IDS` in `tools/gen-meditation.ts` + the `VITE_VOICE_*` env.

## Watch out for
- **The 7 new meditations won't appear in the app yet** — `index.json` still
  lists only the 3 originals. They show up only after you run the tool.
- On re-renders, **`--voice` must match the original** (body-scan-01=hush,
  breath-01=ember, forest-01=glen) or it synthesizes in the wrong voice.
- The app's **displayed duration is a word-count estimate** (`words/115`) and
  under-reports real audio — every script runs ≥8 min spoken (esp.
  quiet-shuffle, whose per-image pauses the estimate ignores).
- **SW cache bump is mandatory** when committing the re-rendered 3 (same
  filenames) or the old cached audio sticks on devices.
- **B7 (overnight): possible story data loss** — mitigations shipped, root
  cause device-dependent; watch whether generated stories vanish.
- **B1–B4 audio-seam bugs need your source audio** — not fixable in-repo from
  the trimmed MP3s. See PENDING-DECISIONS.
- Worktree/Drive "Permission denied" spam on git ops is expected and
  cosmetic. Safe = committed + pushed on `main` (it is).
