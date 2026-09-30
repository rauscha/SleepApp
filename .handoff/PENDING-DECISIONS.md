# Pending decisions / queued actions

**What is open, and who it is waiting on.** Anything closed has moved to
`ARCHIVE-2026-09-19.md` in this directory. For the rules, see `CLAUDE.md`; for
why things are the way they are, `DECISIONS.md`; for where the last session
left off, `SESSION-HANDOFF.md`.

Restructured 2026-09-19: seven resolved or superseded sections were archived
so this file is only live items.

## At a glance

**Blocked on Andrew**
- **0I** — the rooster is confirmed in `glass-1`. Retire it; pick its
  replacement source (nothing in the local FTUS Concrete pack fits).
- **1** — every meditation plays with no bed. Pick pairings, or wait for 0G.
- **0G** — a source for the singing-bowl replacement bed. Pick a route.
- **0E** — the narration voice. 31 audition files are on your phone. This one
  gates the most: 7 written meditations cannot be rendered until it is picked.
- **0F** — a photograph for `night-train`, plus the two still-off-brief ones.
- **2** — the device pass, which is the gate on tagging v1.0.

**Buildable without you**
- **0B** — 8 variants still step >3 dB at the wrap, the same 8 the 2026-09-02
  audit found. They come from content in their vetted windows (forest-evening
  wind-1 starts in a lull). The fix is loopify's start search on a re-cut,
  which shifts each window by seconds.
- **C6 / variants** — two items carried out of the archived
  `notes/TODO_PHASE2-2026-05.md`; see "Carried forward" at the bottom. B4,
  the wake lock, was the third and is fixed.
- **4** — cleanup chores, on request only.

## 0K. DONE 2026-09-30 — rain-4 re-cut exactly

Andrew downloaded the 2026 Immersive bundle's `ORTF3D_RAIN_01` to tikiserv
through a remote browser (`~/remote-browser.sh`). #669 is in it. rain-4 is
now exact (DECISIONS.md addendum). The zips live in
`~/Downloads/remote-browser/`; the extracted picks are in
`~/sounds/ftus/picked-2026-09-30/`.

## 0I. OPEN 2026-09-29 — the 1am rooster is in `glass-1`, not the cabin

**Confirmed by ear 2026-09-29:** "THAT'S THE EVIL BIRD WAKING ME." And
glass-1 was already flagged for replacement (mono Pixabay source), so the plan
is to **retire it**, not repair it. It ships in both night-train and
rain-on-window.

**Replacement source: nothing on hand fits.** The only FTUS rain on
crane-desk is `D:\Sounds\RAIN_01` (the stereo WOSB pack), and it is entirely
the CONCRETE category. Its window-perspective takes are all too short for a
409 s loop, which needs at least 445 s: Korea hotel-window nights run 300 s,
Tbilisi hotel window 300 s, and Korea morning 424 s with "Crows" in the name.
The long files are city traffic or Denver balcony B-format with thunder. The
ORTF3D umbrella series is glass-3's source (#670) plus an unused sister, #671
(12:25, same session, also "Birds and Crows"), but ORTF3D_RAIN_02 is no longer
on disk. Glass or window categories would be in a later RAIN ZIP. Getting it
needs Andrew's Gumroad login. Options:
1. Download the FTUS RAIN ZIP that holds glass/window (Andrew), then cut from it.
2. Re-download ORTF3D_RAIN_02 for #671. Its 12 minutes leave room to choose a
   409 s window with no crows.
3. Interim: drop glass-1 from both scenes now. night-train's rain then runs on
   glass-3 alone, one variant short of the two-per-element target.

The original analysis follows.

### (analysis, 2026-09-29)

0H cleared the cabin squeak by ear. Re-cut on Andrew's rule, "whenever I hit
mark, go 10-20 seconds back", on every layer of both 1am marks. Only one layer
has a sustained call in those windows: **`rain-on-window/rain-on-glass/
glass-1.opus`**, which night-train borrows for its rain and rain-on-window
ships directly.

**Four calls, all in one stretch of the file.** Each is a 0.6-1.8 s two-partial
harmonic tone, about 730 Hz with a strong second partial near 1450 Hz, falling
at the end:

| call | glass-1 position | against the marks |
|---|---|---|
| 1 | 233.9-235.1 s | **13.7 s before mark 9** (01:19:12) |
| 2 | 253.1-253.7 s | **8.7 s before mark 10** (01:19:26) |
| 3 | 263.4-265.1 s | just after mark 10 |
| 4 | 275.2-276.9 s | 13 s after that |

The file loops every 409 s, so this cluster comes back about 9 times an hour
whenever glass-1 is the rotated variant, in both scenes.

**Why the 2026-09-14 bird repair missed it:** `scan-tonal-events.py` and the
repair only look at 2.5-9 kHz. These calls sit at 0.7-1.5 kHz, like the cabin
squeak at 0.3 kHz. And 0H's first pass looked at each layer *at* the marked
second, where the rain really was just rain.

A 400-2500 Hz sweep of every rain-on-window and night-train file found no other
sustained harmonic call. glass-2 has three short, weaker ones at 450-520 Hz
that are worth a listen; the long ~420 Hz tones in the rumble files are thunder.

**[ANDREW] Listen, then pick a fix.** The Taildrop copies were deleted 2026-09-29; the WAVs are in `notes/marker-renders/rooster-back/`
(`A` suspect 228-280 s, boosted 8 dB; `B` a control stretch). The scrubber is at
`notes/marker-renders/rooster-back/scope/index.html` (gitignored). The fixes:
spectral repair of the four calls in place (same tool and loop guarantees as
the 2026-09-14 bird fix, with the band lowered), or replacing glass-1 with
glass-3 in night-train. Either change to audio bytes needs a CACHE_VERSION
bump.

## 0G. OPEN 2026-09-16 — the bowls are OUT of the catalogue, and need sourcing

Andrew: "I thought we still need to resource the bowls? The old ones were
hella disharmonious." Then: "We're replacing but need to source them. No
recordings available." And: "Comment out bowls for now. Don't worry about it
now."

**Done: the scene is held back.** `public/scenes/_held-back/singing-bowl.json`,
out of every glob, out of `index.json`. Nine scenes ship. Nothing deleted —
the audio, photo and gradient all stay, so restoring it is moving one file
back. Reasoning and cost are in `public/scenes/_held-back/README.md`.

**Open: THE SOURCE.** This is the whole task and it is not started. The
standing design decision (2026-07-01, DECISIONS.md "warm pad/drone is the
default meditation bed") says what the replacement is — a warm ambient
pad/drone voiced for under-narration: HPF ~80-100 Hz, a 200-500 Hz dip,
2-4 kHz left clear for consonants, ~15 dB speech-over-bed. What it does not
have is material.

Two routes, both from that decision, neither started because Andrew stopped
this path for now:
1. **99Sounds "Drones"** — the library the decision calls "Red Fog", which is
   the artist; the pack is "Drones". 50 drones, 24-bit WAV 44.1 kHz stereo,
   757 MB, royalty-free including commercial use.
   `https://99sounds.gumroad.com/l/aonqnz`. **Gated: Gumroad wants an email
   address**, which is Andrew's to give, not Claude's. Once the zip is in
   `~/sounds` it loop-cuts through the normal pipeline.
2. **DSP synthesis** in numpy/ffmpeg — slow detuned partials plus filtered
   noise, the same route as the pre-rendered noise beds. Buildable here
   unattended, no third party, no gate.

**MusicGen stays rejected** and the 11 real bowl recordings the superseded
2026-06-21 plan named are on neither machine — searched `~/sounds` on
tikiserv and `C:\GDrive\SleepApp\raw-sounds` plus `D:\Sounds` on
crane-desk. Bowls as an optional texture on top would need their own fresh
sourcing.

**Known cost while held back:** `body-scan-01`, `breath-01` and `forest-01`
name singing-bowl as their bed and now play bare. ContentPlayer warns and
carries on; it does not break.

**A seam fix landed on this scene on 2026-09-15 (`1152001`) before any of
this was checked.** It took the worst wrap step from 19.0 dB to 0.74, which
is a real fix, but on material that was already rejected — the wrong job,
done well. Not reverted: the deploy had already published CACHE_VERSION v14,
so a revert costs a second full re-download and returns nothing. The general
finding in it is still worth having — see "Watch out for" in the hand-off.

## 0E. OPEN 2026-09-14 — the audition is rendered and staged, waiting on ears

**Narrowed 2026-09-19: the library no longer waits on this.** Andrew chose
`stone` and the whole library is rendered in it (item 1). What is still open
is the question the audition was actually built to answer — whether a local
engine is good enough to replace ElevenLabs, which decides whether the
library can be re-rendered on a whim for free. That is now an improvement
rather than a blocker.

1. **[ANDREW] Listen to the 23 staged files** in `/tmp/audition2/send` and say
   the word to Taildrop them (held back deliberately — one Android
   notification per file, finished after midnight). The `BED-*` files against
   `BED-ELEVENLABS-stone` answer whether any local engine is good enough; the
   `DRY-*` files pick a voice. Full record:
   `notes/engine-audition-2026-09-14.md`.
2. **[ANDREW] Your own voice as a reference** — wanted, not found. Not on
   tikiserv, not in digi-me (`voice/` is a PLAN.md stub), not in
   writing-style (transcripts only), and not in a deep search of crane-desk's
   D:, user profile or GDrive. He chose to skip it this round; point at the
   files and it becomes a fifth reference.
3. **[ANDREW, eventually] Three of the four engines are personal-use-only.**
   XTTS is Coqui CPML non-commercial, Higgs is Boson research/non-commercial,
   StyleTTS2's weights repo ships no licence file at all, and Chatterbox is
   MIT but watermarks every output. All fine while SleepApp is a one-user
   app. Worth a conscious decision rather than a default.

**Settled this session:** ElevenLabs beats Kokoro under a bed comfortably, so
local is not yet good enough and the other engines were tried; the train
scene's third element is distant thunder rumble (re-cut 251 -> 199); and the
`stone` voice is a tuned native-English voice, England-leaning with an
American pull — **not Herzog and not German**, proved by a Herzog control
that the classifier failed to detect German in at all.

## 0D. CLOSED 2026-09-19 — the two answers from 2026-09-13

Kept for the settled facts at the bottom; both questions are resolved.

1. ~~**The 15-file voice audition.**~~ ANSWERED: ElevenLabs beat Kokoro under
   a bed comfortably, which did not close the local-render question so much as
   narrow it — Andrew asked for four more engines. **Superseded by 0E**, which
   is the live version of this question.
2. ~~**Third element for the train scene.**~~ SETTLED and BUILT 2026-09-15:
   distant thunder at 199 s. It was not re-cut from the shipped rain-on-window
   rumble in the end — re-cutting an already-seamed lossy loop would have been
   a second generation over a wrap that was already fitted. It was assembled
   fresh from the FTUS closed-door thunder clips instead, which is also the
   right timbre for weather heard from inside a sealed cabin.

**Settled this session:** 125 wpm is the narration pace (90 wpm was hated,
refuting the craft sources); ceilings + a perceptual taper ship on every
volume slider; the train scene's source is FTUS TRAINS_02's Thailand
first-class cabin (602 s, "Railway Clicks").

## 0F. OPEN 2026-09-15 — the train scene ships without a photograph

`night-train` is cut, voiced, conformance-green and in the catalogue. It is
the only scene with no photo, so it draws its gradient instead — supported,
but off-brief ("Photography, not illustration"). The look to match is a warm
cabin interior against a cold window. Everything else about the scene is
finished.

**Three photos are wanted in total, not four** (audited 2026-09-19): this one,
plus roadmap 4.3's `forest-day.jpg` (too daylight) and `monsoon.jpg` (nearly
white). 4.3's third, the singing-bowl Buddha statue, is moot while that scene
is held back. The set-wide tonal grade 4.3 also asked for never happened —
only `waterfall-valley.jpg` was graded, and it is Andrew's own photograph.

## 0B. UPDATED 2026-09-11 — review done, markers built, seams still open

- **Engine review: DONE.** Andrew ran it from the CLI on 2026-09-10. Its top
  four findings landed on main (60e3e95); the four its DECISIONS entry left
  unfixed were cleared on `overnight/2026-09-11`, along with two persistence
  gaps in the same area.
- **Debug markers: BUILT** on `overnight/2026-09-11` (PR open, supersedes
  #18). The three §5 questions were answered by building the recommended
  option: media key yes but behind a default-off setting, stories yes (four
  lines), native-loop fix kept separate. All three stay reversible — say the
  word and any of them comes out.
- **[ANDREW] Device pass is the one thing left for the markers.** Nothing
  else can confirm the trigger works in the dark on a locked phone.
- **Seams: 8 of 71 variants still wrap over 3 dB** (audit, 2026-09-19; was 12
  before the singing-bowl rebuild). Worst first: `forest-evening/wind-1` 9.8
  dB, `ocean-night/wave-3` 8.4, `ocean-night/far-1` 7.8,
  `forest-evening/forest-2` 4.6, then four between 3.5 and 3.9. Sources are on
  tikiserv (`~/sounds`). **Check the search slack before blaming the source**
  — `sourceDuration - loopOffset - 6` is seamfit's entire range, and that,
  not the recording, was what put a 19 dB step in the singing bowls.
- **Native-loop fix: DONE 2026-09-11** and it confirmed the worry —
  Howler's loop cost 27 ms of silence at every wrap, after the gapless
  crossfade, so the seam work so far has been fixing the level step and
  leaving the hole. Measured, reproducible via `tools/loop-probe/run.sh`.
  Unmeasured on a real device; that is what the markers are for.

## 2. Remaining v1.0 roadmap items (your input / hardware)

These two are the whole remaining roadmap; everything else in
`notes/shipping-review-2026-06-12/09-roadmap-to-v1.1.md` is done or obsolete,
and that file now opens with a status block saying which is which.

- **4.3 [ASK] photos** — three wanted: `night-train` (has none at all),
  `forest-day.jpg` (too daylight), `monsoon.jpg` (nearly white). You
  source/pick; I optimise, tonal-grade and update NOTICES.md. See 0F.
- **5.2 [DEVICE] device pass, then tag** — PWA install, iOS Safari, an
  overnight on the Howler engine, and the debug-marker trigger on a locked
  phone (0B). Then `version` to `1.0.0`, tag, append DECISIONS.md.
  `package.json` still reads `0.1.0` and there are no tags yet. **This is the
  gate on v1.0.**

## 1. DONE 2026-09-19 — the library is rendered, on `stone`

Andrew picked `stone` for the whole library rather than waiting for the
engine audition to close. Ten meditations (3 re-rendered, 7 new) and all four
stories now run in one voice. `gen-meditation.ts` gained `stone`/`tide` so it
could reach a story voice at all — the library was in five different voices
because the two tools kept separate maps, not because anyone chose that.

**[ANDREW] The one thing left: every meditation plays with no bed.** The
three old ones point at `singing-bowl`, which is held back (0G); the seven
new ones have no `sceneId` because the tool could not set one until today.
Meditations use `stop-with-content`, so the bed is purely an underbed for the
voice — it does not have to survive the night, it has to sit under a voice
without competing.

`tools/gen-meditation.ts --id <id> --scene <scene-id> --script <path>` sets
one without re-rendering the audio. Suggested pairings, all taste, yours to
overrule:

| meditation | suggested bed | why |
|---|---|---|
| warm-room | `fireplace` | it is literally a low fire and a blanket |
| forest-01 | `forest-evening` | a forest clearing at dusk |
| lake-at-dusk | `waterfall-valley` | the only still-water bed there is; imperfect |
| under-a-slow-sky | `forest-night` | outdoors, night, no weather |
| the other six | `rain-on-window` | broadband, eventless, the classic bed under a voice |

The alternative is to wait for the pad/drone in 0G and put all ten over it,
which is what the 2026-07-01 decision intended. That is probably the right
answer and it is blocked on sourcing.

## 3. Self-voice clone (when ready)
You're cloning your own voice in ElevenLabs to narrate these. Once you have
the voice ID, I'll add it to `VOICE_IDS` in `tools/gen-meditation.ts` and the
`VITE_VOICE_*` env so you can synthesize any meditation with `--voice <yours>`.

## 5. Overnight audio-seam bugs B1–B4 — PROBABLY MOOTED 2026-07-02, confirm at audition
The clean-source refresh (`ae3c357`) replaced forest-night wind and all
ocean-night waves wholesale (new sources, gapless fade-wrap loops), which
should moot B1/B3/B4 outright; B2's linear-vs-equal-power wrap concern applies
to the new `loopify-scenes.py` wrap too but hasn't been audible so far. Close
these after Andrew's audition of the new cuts passes. Original report kept
below for reference:
From the 2026-06-17 overnight listening session
(`notes/bug-reports-2026-06-17.md`). Loop-seam/level defects in shipped scenes
that need the **original source audio + your ears** — not fixable from the
in-repo trimmed MP3s:
- **B1** Forest Night "wind in leaves" has an incongruous car/plane sound —
  pick A→B loop points that exclude it.
- **B2** Loop wrap uses a LINEAR crossfade; should be EQUAL-POWER. Specced and
  ready to apply to `tools/loopify-scenes.py` once sources are available.
- **B3** Choose mid-clip A→B loop points that are sonically similar (makes B2's
  crossfade inaudible and routes around B1).
- **B4** Ocean Night: sharp cutoff at the loop end on the swelling wave — land
  the seam in a quiet trough (B3) + equal-power wrap (B2).
Branch `claude/forest-night-audio-crossfade-f5w5ws` exists for this (no open
PR). B5 is done; B6/B7 mitigations shipped — **B7 is a possible-data-loss watch
item** (a generated story vanished overnight).

---
**Superseded (pre-pivot, 2026-06-06 list):** the old "device-test the bed/story
items" and "residual wake-lock gap in ContentPlayerScreen" decisions were tied
to the Web Audio overnight path that the Howler pivot replaced. Overnight
survival is now confirmed (6h, PR #13); session-owned protections were
rewritten in `HowlScenePlayer`. Any remaining device validation is folded into
roadmap 5.2. See DECISIONS.md for the pivot record.
## 4. Cleanup chores (low priority, only on "deferred clean-up work")
- Worktree litter under `.git/worktrees/` + `.claude/worktrees/` (Drive holds
  handles — `prune`/`rm` fail with Permission denied; cosmetic).
- `git remote prune origin` (remote-tracking refs bloated); delete any stray
  `claude/*` branches that are 0 ahead of main.
- `rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3`
  (gitignored loudnorm backups, if present).


## Carried forward from the archived Phase-2 TODO (2026-09-19)

Three items from `notes/TODO_PHASE2-2026-05.md` were still live when it was
archived, so they live here now rather than in a file nobody should read.

- ~~**B4 — the wake-lock default contradicts its own decision.**~~ **FIXED
  2026-09-19** (`976e028`). Andrew: "We shouldn't keep the screen fully on."
  It is now the `keepScreenAwake` setting, **default off**, gating both the
  Player and the ContentPlayer, with the DECISIONS entry the June review
  asked for. The lock was one third of the Web Audio keep-alive stack and the
  2026-06-15 pivot removed its premise; the silent loop and element sink went
  with the pivot and this was missed. **Worth watching on the next few
  overnights** — the 6h run that confirmed the pivot held this lock, so its
  contribution was never isolated. If a night dies with the screen asleep,
  turn it on before assuming anything else.
- **C6 — the multi-hour audio soak test never ran.** `tools/loop-probe/` and
  `notes/loop-seam-audit-2026-09-02.md` cover the wrap seam; what was
  specified and never done is a long run watching for spectrum
  discontinuities across a whole night.
- **Variant pools.** The original rule was at least 2 variants per element so
  `variantRotation` has something to rotate.
  **`waterfall-valley/falls-main` ships exactly one.** Everything else has
  2–5.
