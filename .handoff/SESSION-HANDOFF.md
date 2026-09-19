# Session hand-off — 2026-09-19 (machine: tikiserv)
# Newest block. Everything below is prior history; this supersedes it for
# REPO STATE.

## STATE
- `main` clean, pushed, single worktree. No PRs in this repo.
- Green: `npx tsc --noEmit` clean, `npx eslint src` clean, `npx vitest run`
  **283/283**, `npm run build` clean.
- **9 scenes ship**, `singing-bowl` is held back. 4 stories, 3 meditations
  rendered, 7 written and unrendered.
- CACHE_VERSION **v14**. No audio bytes moved this session.
- On tikiserv, prefix tool-shell commands with `source ~/.nvm/nvm.sh`.

## This session: documentation, top to bottom
No app behaviour changed. Every document in the repo was audited against the
tree and either rewritten, corrected, archived or split.

- **`CLAUDE.md` rewritten wholesale.** It was describing a project with an
  in-app AI generator and eight scenes. It now opens with where the project
  actually is, and leads with a rule that would have prevented this week's
  worst hour: **read the decision history before changing content, not
  after.** New sections cover the hand-made library, holding a scene back,
  the loop-search slack rule, the source-preparation tools, and when a
  CACHE_VERSION bump is and is not free.
- **`README.md` rewritten.** It still claimed AI-generated stories, Phase 3
  in progress, and three starter scenes.
- **`AUDIO_SOURCES.md` rewritten.** It was a pre-sourcing wishlist that
  ranked Freesound first and Free To Use Sounds last; the truth is the exact
  inverse, and no Freesound file ever shipped. It is now a record of where the
  74 variants actually came from, per scene, plus the pipeline and what is
  still wanted. The search-terms table for the four never-built scenes was the
  one part worth keeping.
- **`TODO_PHASE2.md` archived** to `notes/TODO_PHASE2-2026-05.md` with a
  do-not-work-from-this header. It is entirely superseded but three shipping-
  review reports cite it by item ID, so deleting it would orphan them.
- **`.handoff/PENDING-DECISIONS.md` split.** Seven closed sections moved to
  `ARCHIVE-2026-09-19.md`; the file now holds only live items and opens with
  an at-a-glance list of what is blocked on Andrew versus buildable now.
- **`.handoff/SESSION-HANDOFF.md` split.** Blocks from 2026-08-19 and earlier
  moved to `SESSION-HANDOFF-ARCHIVE.md`.
- **The v1.1 roadmap now opens with a status block.** Audited item by item:
  **28 of 33 steps are done or obsolete.** Five are open and only one is code.

## The three findings the audit turned up
Carried into `PENDING-DECISIONS.md` rather than left in an archived file.

1. **The wake lock contradicts its own decision.** The Phase-2 document says
   "we must NOT request wake lock by default"; `PlayerScreen` calls
   `useWakeLock(scene !== null)`, holding the screen on all night. The
   2026-06-12 review flagged it as a deliberate pivot with no DECISIONS entry
   and no user setting. **It still has neither.**
2. **`waterfall-valley/falls-main` ships one variant** where the rule is two,
   so `variantRotation` has nothing to rotate.
3. **The whole meditation category currently plays with no bed** — all three
   rendered meditations name `singing-bowl`, which is held back. Intended and
   documented, but it resolves only when the replacement bed lands.

## Watch out for
- **The lesson that cost the most this week:** on 2026-09-15 an hour went into
  perfecting the loop seams of the singing-bowl scene. The decision to throw
  that audio away had been on record since 2026-06-21 in two places, one of
  which read "Singing-bowl: replace, don't re-cut". The measurements told a
  clean story and the history said the work was pointless. **Grep the history
  before changing content.**
- A push to `main` **is a deploy** — `deploy.yml` publishes to GitHub Pages
  every time. That is why a CACHE_VERSION bump is not free: it makes every
  install re-download ~430 MB, immediately.
- Everything in the 2026-09-14 block below still applies: the waiter harness,
  the pgrep self-match trap, controls on every classifier, and "rate cannot
  distinguish fast from truncated".

---

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
3. **The singing bowls** — seams fixed (the wrong job), then the whole scene
   held out of the catalogue. Nine scenes ship. See the correction below.

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

## CORRECTION — the singing-bowl rebuild was the wrong job
Andrew caught this on 2026-09-16: "I thought we still need to resource the
bowls? The old ones were hella disharmonious." He is right, and the decision
was already on record twice before the work started.

- **`notes/scene-audio-flags-2026-06-21.md` rejects all five layers by name**
  — drone-1 "screeching teapot", drone-2 "industrial ghost music", drone-3
  "ghost music", shimmer-1 "wrong character (asian flutes/pipes)", shimmer-2
  "old-school mp3 warble". The 2026-09-10 hand-off repeats it in four words:
  **"Singing-bowl: replace, don't re-cut."**
- **What actually stands (2026-07-01, DECISIONS.md "warm pad/drone is the
  default meditation bed"):** the scene is to be REPLACED by a warm ambient
  pad/drone, voiced for under-narration (HPF ~80-100 Hz, 200-500 Hz dip,
  2-4 kHz clear, ~15 dB speech-over-bed). Build route in order: (1) audition
  99Sounds "Red Fog" and loop-cut it through `loopify-scenes.py`; (2) fall
  back to DSP synthesis in numpy/ffmpeg. **MusicGen stays rejected.** Real
  bowls are demoted to an optional later texture.
- **The 11 real bowl recordings are gone.** Not in `~/sounds` on tikiserv and
  not on crane-desk (`C:\GDrive\SleepApp\raw-sounds`, `D:\Sounds`) — the
  only bowl-named files anywhere are the five rejected MusicGen stems. So the
  2026-06-21 "rebuild from the 11 real recordings" plan is not reachable even
  if it had not already been superseded.

**What the rebuild commit (`1152001`) did and did not do.** It is a real fix
to a real defect: the loop-start search had an eleven-second window and the
worst variant stepped 19.0 dB across its wrap; all five are now under 0.8 dB
and the catalogue went from 12 of 71 over 3 dB to 8. But the material is the
material — a better seam on a screeching teapot is still a screeching teapot,
and the scene should not be in the catalogue in this state at all.

**The scene is now held back entirely** (`b05f792`) —
`public/scenes/_held-back/`, out of every glob and out of `index.json`, with
the reasoning in a README beside it. Nine scenes ship. Nothing deleted.

**The seam commit was not reverted, deliberately.** `deploy.yml` publishes to GitHub Pages on
every push, so CACHE_VERSION v14 is already live and every install will
re-download once. Reverting would buy a second full re-download and give back
nothing, since the pad/drone replacement changes these bytes again anyway.
The tooling work in that commit stands on its own: the slack finding
generalises to every scene, and `build-singing-bowl-scene.py` becomes the
loop-cut half of whatever replaces the bed.


1. **Source a replacement bed for the bowls.** PENDING-DECISIONS 0G has the
   detail. The scene is out of the catalogue now, so nothing is broken and
   nothing is urgent, but three meditations play bare until it lands. Andrew
   paused this path on 2026-09-16 — **do not start building a pad until he
   picks a route.** Route 1 needs him to pull the 99Sounds "Drones" zip past
   a Gumroad email gate; route 2 is DSP synthesis, buildable here.
2. **[ANDREW] The voice audition is still waiting on ears** — 31 files on
   pixel-8-pro, `BED-*` against `BED-ELEVENLABS-stone`. Nothing downstream
   moves until a voice is picked: 7 of 10 meditation scripts are written and
   unrendered, waiting only on voice + engine.
3. Re-cut the remaining seams. After the bowl rebuild the audit reports
   **8 of 71 variants over 3 dB**, worst first: forest-evening/wind-1 at
   9.8 dB, ocean-night/wave-3 at 8.4, ocean-night/far-1 at 7.8,
   forest-evening/forest-2 at 4.6, then four between 3.5 and 3.9. These are
   field recordings, so the fix is a longer source rather than a longer
   stitch — check `~/sounds/ftus/loops` before assuming a re-cut is
   reachable. **The bowl lesson generalises: look at the slack first.**
   `assembledSeconds - loopOffset - 6` is the whole search range seamfit
   gets, and under about 30 s it cannot beat a slow swell.
4. Fix the ElevenLabs Studio endpoints in `tools/gen-story.ts` (5 paths).
5. Roadmap `[ASK]`/`[DEVICE]` items for v1.0: replace 3 off-brief photos
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
