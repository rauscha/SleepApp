# Originality Review — Sleep App (pre-v1.0)

*Review 07. Taxonomy: **Visionary** / **New-ish** / **Well-executed standard** / **Poorly copied** / **Trash**.*

---

## Verdict

This app's marketing instinct — and its own CLAUDE.md — believes the crown jewel is the
Eno-style incommensurate-loop engine. It is wrong. That engine is a lovingly built
implementation of a technique that myNoise has been shipping to millions of users since
2013 and that Eno put on tape in 1978. The actually rare thing in this codebase is the
part nobody would put on a landing page: the bloody-minded, incident-driven engineering
that keeps a pure-web audio app alive through eight hours on a phone that is actively
trying to kill it. Nobody ships that, because everybody who needs it goes native.
This app didn't, and the scar tissue — zombie-context watchdogs, element-sink discard
armor, a flight recorder for your own bedroom — is the most original material here.

Net: **one genuinely rare system, two smart twists, a solid stack of well-executed
standards, and one feature that should be quietly rethought.** For a personal app built
in roughly two weeks of commits, that is a strong ratio. But the thing it brags about
and the thing it should brag about are two different things.

---

## Classification table

| # | Component | Verdict | Closest prior art |
|---|-----------|---------|-------------------|
| 1 | Incommensurate-loop ambient engine (prime offsets) | **Well-executed standard** | myNoise stems, Eno *Music for Airports*, Bloom/Reflection |
| 2 | All-night mobile-web survival stack | **Visionary** (by rarity) | Scattered Stack Overflow folklore; no shipping equivalent |
| 3 | AI-personalized sleep stories + chunked TTS | **New-ish** | bedtimestory.ai, SoundAiSleep, Calm sleep stories |
| 4 | AI-generated bundled meditations | **Poorly copied** | Calm, Headspace, Insight Timer's free human-narrated library |
| 5 | Scene JSON authoring format + catalogue | **Well-executed standard** | myNoise generator configs, game-audio soundbank formats |
| 6 | Midnight Editorial design language + Tonight-first IA | **Well-executed standard** | Portal, Dark Noise, editorial-dark app genre |
| 7 | Radical anti-feature stance | **New-ish** | Dark Noise's no-account model; otherwise an industry of streaks |
| 8 | Tinnitus masking engine (shelved) | **Well-executed standard** | myNoise tinnitus generators, ReSound Relief, audiology-standard masking |
| 9 | Diagnostics lifecycle log | **New-ish** | Native flight-recorder logging, inverted |
| 10 | DECISIONS.md "how to reject this" practice | **New-ish** | ADRs (Architecture Decision Records), made falsifiable |

---

## 1. The incommensurate-loop engine — Well-executed standard

The app's own documentation treats the pairwise-coprime loop-offset scheme
(`PRIME_ADJACENT_LOOP_OFFSETS_SECONDS` in `src/audio/sceneFormat.ts`: 251, 409, 521,
691, 887) as core intellectual property — "READ THIS BEFORE TOUCHING SCENES," in
capitals. The technique is real and it works: layers looping at pairwise-coprime
periods only realign at the LCM, ~28.5 hours for the smallest pair.

It is also exactly what the closest prior art does. [myNoise](https://mynoise.net/faq.php)
builds every soundscape from multiple stems of deliberately different lengths, looped
independently with random seek offsets, so the composite "never repeats" — Stéphane
Pigeon has been shipping this to a mass audience since 2013. Eno did it with tape
loops of incommensurate lengths on *Music for Airports* in 1978, and his generative
apps (Bloom, Reflection) go further into true rule-based generation than this app
does. Endel goes further still — real-time on-device synthesis reacting to time of
day and biometrics. Against that lineage, "different prime loop lengths per layer"
is the *entry-level* version of generative ambient, not the frontier.

What earns the "well-executed" half: the formalization. Where myNoise's
different-stem-lengths is an emergent property of its recordings, this codebase makes
the math an explicit contract — a canonical list of true primes, the documented
correction of the previous "prime-adjacent" values (253 and 407 share a factor of 11,
LCM ~2.6 h, audible across a night — that's a genuinely sharp catch), constructor-level
validation in `FileLayer` that buffer durations cover offset + crossfade, and a
written authoring rule that a one-element scene is a bug. That discipline is rare
and good.

Which makes it embarrassing that **the contract is already violated in shipped
data**: `public/scenes/rain-on-window.json` uses `loopOffsetSeconds: 515` for the
rain-pavement layer. 515 = 5 × 103. It is not on the canonical list, and the rule
in CLAUDE.md says off-list values "are wrong even if they're close to a prime."
(It happens to remain coprime with 251 and 409, so the audio is fine — but a
contract that is both un-enforced in code and broken in the flagship rain scene is
a contract in name only. Either validate offsets against the list at load time or
stop calling it a contract.) Also: the constant is still named
`PRIME_ADJACENT_LOOP_OFFSETS_SECONDS` after the comment explaining the values are
now *true primes specifically because prime-adjacent was a bug*. Rename it.

## 2. The all-night survival stack — Visionary (by rarity)

Here is the thing worth the word. Conventional wisdom — visible in
[Chrome's own Web Audio FAQ](https://developer.chrome.com/blog/web-audio-faq), which
suggests you simply *stop playback when backgrounded* — is that long-running
background Web Audio on mobile browsers is a lost cause. Every serious sleep-audio
product (Endel, Calm, Dark Noise, Portal, myNoise's apps) ships native precisely to
dodge this. The web folklore for keeping a tab alive exists only as scattered
Stack Overflow threads and Chromium bug comments. This app assembled the folklore
into a coherent, layered, *instrumented* defense system, and the git log shows it
was hardened against real overnight incidents, not hypotheticals:

- **3-iteration lookahead pipeline** (`FileLayer.LOOKAHEAD_COUNT`): audio scheduled
  via `source.start(t)` is locked to the audio clock, so two full iterations survive
  iOS Safari's setTimeout throttling and even JS freezes with zero main-thread help.
  The chain timer degrades into a lazy "top up the tail" trigger with explicit
  `pipelineTail` / `lastHandledStartTime` state to avoid both drain and unbounded
  growth. This is sequencer-grade scheduling applied to a sleep app.
- **Zombie-context watchdog** (`AudioEngine.watchdogTick`): catches the failure mode
  where the AudioContext *claims* `running` but `currentTime` has stopped advancing —
  a dead rendering thread that `resume()` happily no-ops against. Two stagnant 2s
  ticks → full context teardown and rebuild mid-night, rate-limited to prevent
  rebuild loops. The comment cites the specific 2026-06-11 overnight incident that
  motivated it. I have never seen this check in a shipping web app.
- **Element-sink discard protection** (commit `c4ee7fc`): routing the master bus
  through a `MediaStreamAudioDestinationNode` into a real `<audio>` element so Chrome
  classifies the tab as "audibly playing media" — which confers freeze/discard
  immunity that bare Web Audio does not get — with autoplay-trust reuse across
  context rebuilds and a pause-event self-heal. This is the obscurest trick in the
  stack and the most load-bearing.
- Plus the supporting cast: silent keep-alive loop through the master bus (defeats
  Android's idle-context heuristic), MediaSession metadata for OS priority,
  wake-lock re-acquisition on visibility, `resume()`-with-timeout because iOS leaves
  the promise pending forever, and a foreground liveness probe on every return to
  the app.

Each individual mitigation exists somewhere in community lore. The assembled system —
defense in depth, each layer covering a *named, observed* kill mode, with the
lifecycle log feeding incident reports back into new layers — is, as far as I can
determine, extremely rare to nonexistent in shipping web software. "Visionary" here
means *extremely rare*, not *conceptually novel*: it's trench engineering, not
invention. But it is the one system in this app a senior engineer would stop and
read twice.

## 3. AI-personalized sleep stories + chunked TTS — New-ish

The category exists. [Bedtimestory.ai](https://www.bedtimestory.ai/),
[SoundAiSleep](https://elevenlabs.io/blog/soundaisleep), Sleepytale, and a dozen
hackathon projects do "LLM writes story, TTS reads it"; Calm has employed humans to
do drowsy narration for a decade. Claude + ElevenLabs in a trench coat is not novel.

What earns New-ish is that the prompt in `storyGenerator.ts` is engineered for *sleep
induction* rather than storytelling, and it shows craft the prior art mostly lacks:
"Your goal is to induce sleep, not to entertain"; a defined orient → settle → drift
arc with "progressive vagueness, dream-adjacent"; and the genuinely insightful "It is
fine — even good — to end mid-sentence. The listener is already asleep." That last
line is a design position most commercial sleep-story products are too precious to
take. The prosody pipeline is also thought through end-to-end: `[pause]`/`[softly]`
markers converted to em-dashes and SSML breaks (because the TTS endpoint reads
brackets aloud), 0.85 speed with documented floor rationale, and — the unglamorous
part that matters — per-chunk PCM RMS normalization in the browser because raw
chunk concat produced 10 dB level jumps "enough to startle a listener awake."
A volume spike *is* an alarm in this product's threat model, and the engineering
treats it as such. The bed-scene pairing (narration over an ambient scene that keeps
playing after the voice ends, so the room never goes silent) is a small, correct,
sleep-first twist.

It's New-ish, not Visionary, because every piece is assembled from known parts and
the personalization is shallow — a theme string, not anything adaptive.

## 4. AI-generated bundled meditations — Poorly copied

The stories justify AI generation: infinite novel content, personalized themes,
something no library can pre-record. The meditations do not. A body scan is the
same body scan every night — that's the point of one — and the world is drowning
in excellent, free, *human-narrated* body scans (Insight Timer alone hosts tens of
thousands; Calm and Headspace built empires on the warmth of a real voice at 2am).
Against that prior art, three near-identical boilerplate prompts in
`tools/gen-meditation.ts` ("Guide attention methodically through the body: feet →
legs → hips…", differing only in which noun receives attention) feeding a synthetic
voice is a strictly worse version of a thing done better, for free, elsewhere. The
generation tooling is competent — same normalization pipeline, singing-bowl bed
pairing is a nice touch — but competent execution of the wrong call is what
"Poorly copied" means. The story pipeline earns its AI; the meditation pipeline
inherits it out of convenience.

## 5. Scene JSON authoring format + catalogue — Well-executed standard

A declarative scene format — synth bed config, layered elements with variants,
per-layer offsets and volumes, an index catalogue — is standard data-driven audio
architecture; game soundbanks and myNoise's generator definitions are the obvious
ancestors. The execution details are good: pure-data schema with no audio bytes so
scenes can be fetched/shared, sidecar `.json` license files per recording, mix
voicing guidance written down as doctrine (primary ~0.6, support 0.25–0.35, synth
glue 0.10–0.16, sparse events ~0.2), and a typed `AudioLoadError` that only permits
the synthetic-pad fallback on 404 so production failures stay loud. The catalogue
of eight scenes is honest, small, and curated. Nothing here is new; all of it is
done properly — except the un-validated offset contract noted in §1, which is this
format's one structural weakness.

## 6. Design language + Tonight-first IA — Well-executed standard

"Midnight Editorial Minimalism" — deep dark, warm stone, serif headings, sage
accent, photography over illustration — is a tasteful counter to the lavender-orbs-
and-smiling-moons aesthetic of Calm and Headspace. But tasteful dark minimal sleep
apps already exist (Dark Noise, Portal), and editorial-serif-on-dark is a
established genre across app design. The IA discipline is the better part:
one screen, one primary action ("Begin →" on the last-played scene), secondary
scenes quieter, "Surprise me" as a text link, skeleton states, 44px targets
honored, fullscreen requested synchronously inside the tap gesture because the
authors actually read how gesture tokens expire. It is craft, consistently applied
(the DECISIONS.md button-tier taxonomy is the tell), and craft is what
"well-executed standard" is for. One genuine blemish: a visible **"Dev tools"
button in the footer of the flagship Tonight screen**. A pre-v1.0 indulgence,
but in an app whose religion is removing everything that isn't sleep, it's a
small heresy.

## 7. The anti-feature stance — New-ish

No alarm, no notifications, no telemetry, no accounts, no onboarding, no streaks,
no sleep tracking — in a category where the dominant players gamify sleep into a
performance metric (sleep scores, streaks, bedtime reminders that are themselves
notifications), an explicit written doctrine of refusal is a real product position,
and the codebase honors it in letter and spirit (the MediaSession comment carefully
argues it is *not* a notification; the lifecycle log is anti-telemetry — data that
never leaves the device, readable only by its subject).

The sharp-tongued caveat: this is a single-user personal app. "No accounts and no
telemetry" is the *default state* of software you build for yourself — you don't get
courage points for not surveilling yourself. The stance would be Visionary if it
survived contact with public distribution and the monetization pressure that comes
with it. As shipped, it's a well-articulated New-ish: rarer than it should be,
easier than it looks.

## 8. Tinnitus engine, shelved — Well-executed standard

Band-passed white noise centered on a user-matched frequency, with a pure-sine pitch
matcher (2–12 kHz, log spacing, click-free 30/40 ms envelopes) is textbook tinnitus
masking — myNoise has dedicated tinnitus generators, ReSound Relief and other
audiology apps do matched-band masking as their whole product. The implementation
is clean (Q tracking center frequency to hold constant Hz bandwidth is the kind of
detail that's easy to get wrong). The most original thing about this component is
the product decision attached to it: built, then shelved from the UI pending better
UX, kept alive in the engine. Shipping discipline — knowing a feature isn't ready
and hiding it rather than deleting or half-shipping it — is rarer than the feature.

## 9. The diagnostics lifecycle log — New-ish

Flight-recorder logging is ancient practice. What's new-ish is the inversion: this
is telemetry where the user is the only analyst and the data never leaves the
device. A localStorage ring buffer of page-lifecycle events (freeze/resume,
visibility, pagehide tombstones, AudioContext state transitions, media-sink
fallbacks, uncaught errors) that exists so its owner can wake up, see the silence
happened at 3:12 am, and read *why*. The export format shows real empathy for the
use case: local-time timestamps with per-line UTC offsets "so 'woke at 3am' lines
up with the log without mental UTC math," and DST handled. The practice — treating
your own sleep as a production system with an incident log, then feeding incidents
back into engineering (the 2026-06-11 incident → the zombie watchdog) — is
debugging-your-own-life infrastructure, and I haven't seen it formalized like this
before. It's New-ish rather than Visionary only because each ingredient is mundane;
the originality is entirely in the framing and the loop.

## 10. Also notable

- **DECISIONS.md as falsifiable ADRs — New-ish.** Architecture Decision Records are
  standard; ADRs where every entry ends with a "How to reject this" section, written
  overnight by an agent for a sleeping human to adjudicate at breakfast, are not.
  It converts documentation from self-justification into an interface for
  disagreement. Quietly one of the best documents in the repo.
- **Per-sample AudioWorklet noise synthesis** (no looped buffer, hence literally no
  period) — correct, standard, and a nice consistency with the no-repetition creed.
- **AUDIO_SOURCES.md** ranking Freesound/BBC/Pixabay by license compatibility with a
  future "share with friends" build — standard diligence, done well.

---

## The one thing worth bragging about

**The survival stack (§2), and specifically the zombie-AudioContext watchdog feeding
off the lifecycle log.** A web app that detects a rendering thread that died while
claiming to be alive, rebuilds its entire audio graph mid-night without a user
gesture, and was built from a postmortem of a real 3am incident recorded by its own
on-device flight recorder — that is a story no other sleep app, native or web, can
tell. The Eno engine is the poetry, but this is the part that's actually rare.
If this app is ever written up, lead with the night the context lied.

## The one thing to quietly delete or rethink

**The AI-generated meditations (§4).** Keep the story generator — it earns its
synthesis. But the bundled TTS body scans are a worse version of something the world
already gives away with human warmth attached, and they dilute the app's otherwise
ruthless "One Thing" discipline. Either find an angle generation actually buys
(personalized-to-tonight meditations? probably still no) or replace them with two
licensed human recordings and delete the pipeline. While the broom is out: rename
`PRIME_ADJACENT_LOOP_OFFSETS_SECONDS` (they're true primes now — the name
memorializes the bug), fix the off-contract `515` offset in `rain-on-window.json`,
add load-time validation so the offset contract is code instead of prose, and get
the "Dev tools" button off the Tonight screen before v1.0.

---

*Sources consulted for prior-art claims:
[myNoise FAQ](https://mynoise.net/faq.php),
[MyNoise — Wikipedia](https://en.wikipedia.org/wiki/MyNoise),
[Endel](https://endel.io/) / [Endel — Wikipedia](https://en.wikipedia.org/wiki/Endel_(app)),
[Chrome Web Audio FAQ](https://developer.chrome.com/blog/web-audio-faq),
[SoundAiSleep × ElevenLabs](https://elevenlabs.io/blog/soundaisleep),
[bedtimestory.ai](https://www.bedtimestory.ai/),
[Sleepytale](https://www.sleepytale.com/).*
