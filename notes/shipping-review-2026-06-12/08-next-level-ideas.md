# Next-level additions — the ideation track

*Review 08 · 2026-06-12 · ideation pass for the post-v1.0 horizon*

The frame for everything below: **The One Thing is "put me to sleep and let me
stay there."** Every idea is scored against that, not against "would this be
impressive in a screenshot." The app's unique assets — the prime-offset
never-repeating scene engine (`src/audio/sceneFormat.ts`,
`src/audio/FileLayer.ts`), the LLM→TTS story pipeline
(`src/services/storyGenerator.ts`, `tools/gen-story.ts`), the 8-second
sample-accurate scene crossfade (`src/audio/SceneCoordinator.ts`), the
editorial photography (`public/scenes/photos/`), the all-night survival
machinery (`useWakeLock`, `silentKeepAlive`, `serviceWorker/keepAlive`,
`lifecycleLog`) — are the levers. The best ideas pull several at once.

Hard constraints honored throughout: no alarm, no notifications, no telemetry,
no accounts, no streaks, no onboarding wall. Midnight Editorial Minimalism.
Phone in bed, in the dark, one thumb, eyes half closed.

---

## Tier 1 — weekend-sized, ships in v1.1

### 1. The 3 a.m. Door

**Pitch.** You wake at 3:12 a.m. and the worst thing the app can do is be an
app. Right now opening it at 3 a.m. gives you the full Tonight screen — eight
bright-ish cards, choices, a decision tree. The 3 a.m. Door replaces all of
that: when the app opens inside the deep-night window with a `lastSceneId` on
record and nothing playing, it shows a single near-black panel — serif, dim,
maybe 8% brightness equivalent — that says only *"Back to sleep"*. One tap
resumes last night's scene at a reduced master volume (say 60% of normal) with
a long, slow first fade. No catalogue. No Surprise Me. No reading. The door
back into sleep, not the lobby.

**Builds on.** `isBedtime()` in `src/lib/bedtime.ts` already encodes the
hour-window concept — add a sibling `isDeepNight()` ([01:00, 05:00)).
`getSetting('lastSceneId')` + `SceneCoordinator.startScene()` with a custom
`firstFadeSeconds` (the option already exists —
`DEFAULT_SCENE_FIRST_START_SECONDS` is just the default). The reduced master
level is one call into `MasterBus`. The routing branch goes where `App.tsx`
already decides Tonight-vs-Player on cold start. Nightstand mode's pure-black
styling in `PlayerScreen.tsx` is the visual reference.

**The One Thing.** This *is* the "let me stay there" half of the One Thing,
which the app currently serves less directly than the "put me to sleep" half.
Probably the highest leverage-per-line-of-code idea in this document.

**Difficulty.** Weekend. Mostly one new screen state and a routing condition.

---

### 2. Night Drift (the dusk sequence)

**Pitch.** You already shipped a triptych without noticing: *Forest, midday* →
*Forest, evening rain* → *Forest, night* are the same place at three hours of
the day. Night Drift makes time pass. Start the forest in the evening, and
forty minutes later — long after you're asleep — the birds settle, the rain
fades, and the scene has become *Forest, night* via the existing 8-second
crossfade, except stretched to a two-minute crossfade you will never
consciously hear. The scene card grows one quiet line: *"Settles into night."*
The world keeps living after you leave it. That is exactly the Eno promise the
prime offsets make at the micro level, lifted to the macro level.

**Builds on.** `SceneCoordinator.crossfadeTo()` already does sample-accurate
overlapping scene fades; the only new machinery is a `driftTo` field in the
scene index entry (`public/scenes/index.json` → `sceneRegistry.ts`) plus a
timer in the coordinator that fetches the successor definition and calls
`crossfadeTo` with a long `fadeSeconds`. The forest family of scene JSONs
needs zero changes. Pair it with the photo treatment: `sceneBackground.ts`
could crossfade the player backdrop between `forest-evening.jpg` and
`forest-night.jpg` over the same window.

**The One Thing.** Directly serves "stay there": evening scenes have birds and
brightness that are right for falling asleep but slightly wrong for 4 a.m.
Drift removes the wrongness without a single interaction.

**Difficulty.** Weekend. One coordinator timer, one index field, one settings
toggle ("Let scenes settle into night").

---

### 3. Narration Sundown (story ducking)

**Pitch.** Every recorded sleep story in history has the same flaw: it *ends*.
Even a soft ending is a state change, and state changes wake people. Narration
Sundown makes the story end the way you fall asleep — imperceptibly. Across
the back third of a story's known duration, the narration volume rides a slow
ramp downward while the paired scene bed (`sceneId` is already attached to
every story) holds steady, so by the final paragraphs the voice has slipped
*under* the rain. The story doesn't end. It submerges.

**Builds on.** `estimateDurationSeconds()` in `storyGenerator.ts` already
computes story length and stores it in `StoryMetadata.durationSeconds`.
`ContentPlayerScreen.tsx` plays the narration (Howler) over the live scene —
it just needs a position-driven gain curve on the Howler volume. The story
prompt already tells Claude "it is fine — even good — to end mid-sentence";
this is the audio-engine version of that same sentence.

**The One Thing.** Pure One Thing. Eliminates the single most
wake-prone moment in the story path.

**Difficulty.** Weekend. A `requestAnimationFrame`-or-interval gain ramp and a
settings toggle. Tune the curve by ear.

---

### 4. Seasonal Surprise

**Pitch.** "Surprise me" currently rolls fair dice. But you don't want
*Monsoon* in February or *Fireplace* in July — and the app already knows the
date. Seasonal Surprise weights the random pick by month and hour, entirely
offline: fireplace and forest-night rise in winter, monsoon and ocean-night in
summer, rain-on-window in the shoulder seasons, singing-bowl never weighted
out entirely. No weather API, no network, no permission prompt — just a tiny
prior that makes the dice feel like they know you. The button label can stay
exactly as it is; the *taste* changes.

**Builds on.** `handleSurpriseMe` in `src/screens/TonightScreen.tsx` (a
10-line function today) plus a small pure `seasonalWeights(date, sceneIds)`
helper next to `bedtime.ts` — eminently unit-testable in the existing vitest
style (`bedtime.test.ts` is the template). Optional later upgrade: a
user-supplied latitude in Settings for hemisphere flipping. Explicitly *not*
a weather API in this tier (see Tier 2 idea 10 for the honest version of
that).

**The One Thing.** Mildly. It makes the lowest-effort path ("just pick for
me") more likely to land, which keeps decision fatigue out of bed.

**Difficulty.** A quiet evening. Pure function + weights table + tests.

---

### 5. Scene Doctor (the incommensurate-loops linter)

**Pitch.** CLAUDE.md contains the most important paragraph in the repo — the
incommensurate-loops rule — and right now it is enforced by *vigilance*. Scene
Doctor turns the contract into a test: a vitest suite (plus a `tools/` ffprobe
pass for durations) that fails CI if any scene JSON in `public/scenes/` has
fewer than 2 elements, uses a loop offset not in
`PRIME_ADJACENT_LOOP_OFFSETS_SECONDS`, repeats an offset across elements in
one scene, has a variant shorter than `loopOffsetSeconds + crossfadeSeconds`,
or voices the stack outside the mix guidance (primary ~0.55–0.60, supports
0.25–0.35, synth 0.10–0.16). The Eno guarantee becomes something the repo
*proves*, every push, forever — including against future-you at 1 a.m. adding
a scene from your phone.

**Builds on.** `sceneFormat.ts` types + the canonical prime list;
`sceneFormat.test.ts` as the test-file pattern; `tools/probe-audio-dir.sh`
and `tools/summarize-audio-tsv.py` already know how to interrogate the audio
files; `.github/workflows/ci.yml` already runs tests on push.

**The One Thing.** Indirectly but profoundly: the One Thing's worst enemy is a
perceivable loop at hour three, and this makes that class of regression
impossible to ship.

**Difficulty.** Weekend. Mostly glue; the rules are already written in prose.

---

### 6. The Morning Letter

**Pitch.** Open the app at 7:40 a.m. and instead of the Tonight catalogue you
get a single quiet paragraph, set in the serif, like a note left on the
kitchen table: *"Ocean, at night played through until morning — seven hours,
forty-one minutes, one silent recovery at 3:05 that you never heard. The room
is yours again."* One screen, one Dismiss, gone forever — no history, no
charts, no streaks, nothing stored beyond what `lifecycleLog` already keeps
for diagnostics. It reframes the app's overnight heroics (context recreation,
freeze survival) as care instead of engineering, and it gives the night a
gentle full stop.

**Builds on.** `src/diagnostics/lifecycleLog.ts` already persists the exact
event stream needed (visibility, freezes, `context-recreated`); `bedtime.ts`
gives the morning window; the letter is a pure function from log entries to
prose — testable like `lifecycleLog.test.ts`. The dismiss state is one
localStorage key.

**The One Thing — honest flag.** This is *adjacent* to the One Thing, not
inside it: it serves the morning, and it flirts with "sleep reporting." The
discipline that keeps it legal under the brief: no scores, no trends, no
retained history, never more than one paragraph, and it must never editorialize
about sleep *quality* — only about what the app did. If it ever grows a chart,
kill it.

**Difficulty.** Weekend. The hard part is writing prose-generation that stays
restrained; everything else exists.

---

### 7. The First Exhale (arrival ritual)

**Pitch.** The moment between tapping a scene card and being asleep is the
app's whole reason to exist, and right now it's a 5-second fade-in. The First
Exhale stretches arrival into a 60–90 second ritual: the photograph slowly
deepens from its card treatment to near-black (the existing gradient math,
animated), the scene swells in over the same window on a long exhale-shaped
curve, and the only text on screen — one serif line, fading as it goes — is
the scene description read as an invocation: *"Steady surf rolling against a
sand beach… the occasional distant shipyard across the bay."* Then Nightstand
mode takes over. No breathing-circle widget, no coach. Just the lights going
down in the theater.

**Builds on.** `startScene()`'s `firstFadeSeconds` option (already
parameterized); `sceneBackground.ts`'s gradient-over-photo treatment;
`PlayerScreen.tsx`'s existing auto-Nightstand idle timer (`IDLE_TIMEOUT_MS`)
becomes the ritual's terminus; scene `description` strings already read like
this on purpose.

**The One Thing.** Yes — it front-loads the wind-down, which is the "put me to
sleep" half, and it does it with zero new audio machinery.

**Difficulty.** Weekend, mostly CSS/animation taste. Honor
`prefers-reduced-motion` (already flagged in TODO_PHASE2 C8).

---

## Tier 2 — a real feature, a week or two

### 8. The Serial (a bedtime story in seasons)

**Pitch.** The single biggest untapped asset in this codebase is that the
storyteller is a *writer*, not a tape deck. The Serial turns generated stories
into a continuing world: a canal town you return to night after night, where
episode four remembers the lavender barge from episode one. Generate "Episode
1" the way you generate a story today; afterwards, the pipeline asks Claude
for a 100-word *bible* entry (place, recurring images, where we drifted off)
and stores it on the metadata. Next generation in that series feeds the bible
back into the system prompt: *"You are continuing a nightly serial. Never
recap. Begin already inside the world."* Continuity without plot — nothing
*happens* in this town, which is the point — but the texture accumulates, and
returning to a known place is materially more sleep-inducing than orienting
in a new one. The Library groups episodes under the series title like issues
of a quiet magazine.

**Builds on.** `STORY_SYSTEM_PROMPT` and `callClaude()` in
`storyGenerator.ts` (the prompt already enforces the
orient→settle→drift arc — the serial only changes *orient*);
`buildStoryMetadata()` + `StoryMetadata` in `src/storage/types.ts` gain
`seriesId`, `episodeNumber`, `bible`; `LibraryScreen.tsx` gains grouping;
the `sceneId` pairing means a series can live in one soundscape (the canal
town *is* ocean-night). The bedtime gate in `bedtime.ts` still applies —
episodes are generated in daylight, like all executive-function work.

**The One Thing.** Strongly. Familiarity is soporific; novelty is arousal.
This converts the story feature from "novelty each time" to "ritual."

**Difficulty.** ~1 week. Prompt work + metadata migration + Library grouping
UI. The cost story is unchanged (one ElevenLabs job per episode, ~$1–3).

---

### 9. The Living Pad (generative synth bed v2)

**Pitch.** The humble dev-harness test pad (`src/audio/synth/testPad.ts`) is
secretly the seed of the app's most distinctive possible feature: a synth bed
that is *composed live*, forever, with literally no period. Today's scene beds
are noise colors. The Living Pad replaces (or joins) them with three to five
detuned oscillator voices choosing tones from a scene-keyed mode (ocean-night
in low D dorian, fireplace in warm A♭), each voice governed by its own
slow random-walk LFO for amplitude and a glacial glide between chord tones —
the *Music for Airports* trick again, but executed in oscillators instead of
tape loops. Because nothing is a buffer, nothing can loop. The singing-bowl
scene stops needing recorded bowls at all; it becomes an instrument the app
plays all night.

**Builds on.** `testPad.ts`'s partial-stack and LFO math (lifted from buffer
rendering to live `OscillatorNode`s + `GainNode`s); the `Layer` interface in
`src/audio/types.ts` (NoiseGenerator is the reference implementation of a
synth Layer); `sceneFormat.ts` grows `synth.pad?: { mode, root, voices }`
alongside the existing noise `color`; volume discipline comes free from the
existing per-layer GainNode design (DECISIONS.md #5); the master limiter
(DECISIONS.md #3) is the safety net. `latencyHint: 'playback'` keeps it
battery-cheap — a handful of oscillators is lighter than a decoded MP3 layer.

**The One Thing.** Yes — it deepens the never-repeats guarantee at the
spectral layer where loops are most perceivable, and it glues recorded
elements together exactly as the CLAUDE.md mix guidance intends.

**Difficulty.** 1–2 weeks, and most of it is *taste* — voice-leading rules
that never produce a leading tone at 4 a.m. Ship behind one scene first
(singing-bowl is the natural pilot).

---

### 10. Weather Systems (hours-scale macro-drift)

**Pitch.** The prime offsets guarantee the scene never *repeats* — but its
*energy* is statistically constant: the rain at minute 5 is as heavy as the
rain at hour 5. Real weather breathes. Weather Systems adds a second, slower
layer of Eno: each element may declare a `drift` range, and a per-element
macro-LFO — with its *own* period drawn from a new set of much larger primes
(2,003 s, 3,001 s, 4,003 s…) — slowly carries that element's gain across its
authored range over the night. The rain swells for forty minutes, recedes for
an hour; the wind freshens while the creek holds. Combined with the existing
micro-level offsets, the repeat horizon of the *dynamics* becomes weeks. This
is the difference between a recording of a place and a place.

**Builds on.** `SceneElementDefinition` in `sceneFormat.ts` gains
`drift?: { min: number; max: number; periodSeconds: number }`; the per-layer
GainNode chain (DECISIONS.md #5) is the modulation target via
`setTargetAtTime` ramps scheduled by the `Scene` class; the prime-list
discipline extends naturally (Scene Doctor, idea 5, should lint the new
periods too); sparse event layers like ocean-night's `dockside-distant`
become dramatically better — their *probability* can breathe instead of
their loop just being mostly silence.

**The One Thing.** Directly — statistical constancy is the subtlest form of
loopiness, and this removes it. Constraint: drift ranges must keep total
energy gentle; the macro-LFO must never *increase* salience sharply (cap
upward slew).

**Difficulty.** ~1 week engine + re-authoring drift ranges for the 8 shipped
scenes. Very testable as pure scheduling math.

---

### 11. The Wider Room (spatial drift)

**Pitch.** Every layer currently sits dead center. The Wider Room gives each
scene element a *position*: near surf low and slightly left, far surf high
and right, the distant dockside drifting almost imperceptibly across the
stereo field over twenty minutes on — of course — a prime-period pan LFO.
With headphones (or even decent phone speakers) the scene stops being a sound
and becomes a *room*, and a room is something you can fall asleep inside. No
binaural-beats pseudoscience, no HRTF heaviness — just `StereoPannerNode` per
element with authored positions and glacial drift.

**Builds on.** `FileLayer`'s node chain gains one `StereoPannerNode` between
the source mix and the layer GainNode; `SceneElementDefinition` gains
`pan?: { position: number; driftWidth?: number; driftPeriodSeconds?: number }`;
the mix-voicing rules in CLAUDE.md extend naturally ("primary near center,
supports off-axis"); the equal-power math in `crossfade.ts` is the same math
equal-power panning wants.

**The One Thing.** Modestly but genuinely — spatial separation lowers the
perceptual fusion of layers, which makes the whole stack read as *environment*
rather than *audio*, which is less attention-grabbing. Mono-downmix safety
matters (phone on the nightstand): keep positions within ±0.5.

**Difficulty.** ~1 week including re-voicing scenes by ear.

---

### 12. Described Nights (the scene, narrated)

**Pitch.** A hybrid of the two flagship systems that neither can do alone:
a story *about the scene you're already in*. Pick ocean-night, ask for a
described night, and Claude — fed the scene's actual `description` and element
labels ("Surf, near", "Distant dockside") — writes twenty minutes of
second-person presence in *that* room: the window, the bay, the shipyard
sound you will actually hear behind the voice. The narration and the
soundscape corroborate each other, which is uncanny in the best way. This is
TODO_PHASE2's D9, grown up: a `style: 'description'` branch of the story
prompt rather than a new feature.

**Builds on.** `GenerateStoryOptions.sceneId` already pairs stories with
scene beds and `ContentPlayerScreen` already plays them together; the prompt
branch slots into `STORY_SYSTEM_PROMPT`; the scene JSON's `label`,
`description`, and element `label`s are exactly the grounding material the
prompt needs — fetched via `sceneRegistry.fetchSceneDefinition()` at
generation time. Combine with Narration Sundown (idea 3) and the voice sinks
into the very waves it was describing.

**The One Thing.** Strongly — description without arc is the most
sleep-shaped prose there is, and the audio-text coherence removes the mild
dissonance of a forest story over ocean surf.

**Difficulty.** Days-to-a-week. Prompt engineering plus a style picker in
`StoryGeneratorScreen`.

---

### 13. The Workbench (in-app scene authoring)

**Pitch.** Scene authoring today is hand-editing JSON against rules in
CLAUDE.md and transcoding via `tools/*.sh`. The Workbench moves the *mixing*
part into the app, behind the existing Dev tools door: load any scene, get
per-element faders (the Player's collapsible mixer already renders these),
an offset picker that is a dropdown of the five primes and nothing else,
live A/B against the current mix, the `Analyser` spectrum to confirm the
synth bed is gluing, and an "Export JSON" button that emits a
schema-perfect `SceneDefinition` to the clipboard. The hard rules become
*affordances* — you cannot select 230 seconds because 230 isn't in the
dropdown.

**Builds on.** The per-layer mixer in `PlayerScreen.tsx`; `Analyser.ts`
(built for exactly this kind of verification, per TODO_PHASE2 C3);
`PRIME_ADJACENT_LOOP_OFFSETS_SECONDS` as the picker's only options;
`SceneCoordinator.loadScene()`'s synthetic-fallback path means you can rough
out a scene's structure before the audio exists. Scene Doctor (idea 5) is the
CI-side twin — Workbench prevents, Doctor verifies.

**The One Thing.** Indirect: it lowers the cost of making more and better
scenes, which is the app's content flywheel. It ships behind Dev tools so it
adds zero surface to the bedtime path.

**Difficulty.** 1–2 weeks for a respectable version.

---

## Tier 3 — visionary, a new dimension

### 14. The Dreamt Room (LLM-composed scenes)

**Pitch.** Tonight you type: *"a sleeper train through mountain rain, mostly
the rails, the rain on the glass, somebody's quiet radio two compartments
down."* Sixty seconds later that scene exists — not as TTS, not as generated
audio, but as a Claude-authored `SceneDefinition` over a *local library of
tagged recordings*. The trick that makes this real instead of sci-fi: the app
ships (or you sideload) a pool of, say, 60 element recordings, each with a
manifest of descriptors ("rhythmic / mechanical / low", "rain / glass /
close", "music / muffled / sparse-event"). Claude's job is *curation and
mixing*, the things LLMs are genuinely good at: pick 3–4 elements, assign
prime offsets, voice the stack per the CLAUDE.md mix rules (which go straight
into the system prompt), name it, describe it in the house editorial voice.
The output is validated by the Scene Doctor rules before a single sample
plays. Bad picks cost nothing — regenerate. Great picks get saved into your
catalogue next to fireplace, photo optional. The scene engine becomes an
*instrument the storyteller plays*.

**Builds on.** Everything, which is why it's the capstone: `sceneFormat.ts`
as the contract (it was explicitly designed to be "JSON-encoded, fetched,
edited" — this is that future arriving); the same direct-from-browser
Anthropic call pattern as `callClaude()` in `storyGenerator.ts` (user's own
key, bedtime-gated like story generation); `SceneCoordinator.loadScene()`
plays user-defined scenes today without modification; Scene Doctor (idea 5)
becomes the runtime validator; the Workbench (idea 13) becomes the editor for
the keepers; the tagging pass is one afternoon with
`tools/summarize-audio-tsv.py` as the starting point.

**The One Thing.** The honest answer: generation is daytime play, and it must
stay behind the same `isBedtime()` gate as stories — composing a scene at
11 p.m. is exactly the executive-function trap the gate exists to prevent. But
the *output* serves the One Thing better than any fixed catalogue can: the
scene that is precisely your idea of safety is the one you sink into fastest.

**Difficulty.** 2–4 weeks across tagging, prompting, validation, save-to-
catalogue UI. Every prerequisite is independently useful, which is what makes
this a roadmap rather than a moonshot.

---

### 15. The Night Almanac (seasonal & celestial scenes)

**Pitch.** The catalogue stops being a fixed list and becomes a calendar. The
forest scenes already model *time of day*; the Almanac extends the same move
to *time of year* and *sky*: scene JSONs (or index entries) carry optional
seasonal variant sets and the catalogue quietly re-weights and re-skins
itself — crickets thin out as autumn deepens, the monsoon card recedes in
December, ocean-night's description notes the new moon. Pair it with the
photography pillar: the same forest photographed in four seasons, the card
art drifting with the real world outside your window. Computed entirely from
the date (plus an optional fixed latitude in Settings); moon phase is a
20-line pure function; no network, no API, no account. Over a year of nightly
use the app reveals itself slowly — which is the most Midnight Editorial
feature imaginable: restraint with a long memory.

**Builds on.** The forest-day/evening/night family as the proven
"one place, many states" pattern; `index.json` + `sceneRegistry.ts` for
seasonal weighting and label/description swaps; Seasonal Surprise (idea 4) as
the v1 seed it grows from; Night Drift (idea 2) for transitions; the
`public/scenes/photos/` pipeline and its NOTICES.md licensing discipline for
the seasonal art.

**The One Thing.** Gently. Seasonal congruence (hearing weather that could
plausibly be outside) measurably aids the "this is my real room" illusion that
sleep needs. And it gives long-term single-user retention — the only kind
this app has — without a single streak, badge, or notification.

**Difficulty.** The mechanism is ~1 week; the content (seasonal recordings +
photography) is an ongoing practice. That's appropriate — almanacs are
written annually.

---

### 16. The Quiet Program (an overnight program director)

**Pitch.** The boldest version of "stay there": a director that composes your
entire *night*, not your scene. You fall asleep in *Rain on the window*; at
2 a.m. the weather system (idea 10) has let the rain recede to almost
nothing; around 4 a.m. — only if the night is configured for it — the scene
has long-crossfaded into *Forest, night*; and in the last stretch before your
*typical* (user-typed, never sensed) natural waking window, the forest very
slowly admits its first quiet birds, the synth bed warming half a shade. **No
sound ever marks a time.** Nothing crescendos. There is no wake event, no
target, no chime — just a world whose dawn happens to align with yours, the
way a real window does. The plan for the night is shown once, in one serif
sentence, before Nightstand mode: *"Rain, easing after midnight; the forest
toward morning."*

**Builds on.** This is Night Drift (2) + Weather Systems (10) + the scene
family pattern, sequenced: `SceneCoordinator.crossfadeTo()` for chapter
changes, the drift engine for in-chapter dynamics, a `NightProgram` schedule
type that is — like `SceneDefinition` — pure JSON, authorable, lintable, and
eventually composable by the Dreamt Room pipeline (14). The all-night
survival machinery (`silentKeepAlive`, `keepAlive`, context-recreation replay
in `SceneCoordinator`'s `context-recreated` listener) is what makes an
8-hour score *deliverable* — and `lifecycleLog` is how you verify it ran.

**The One Thing — honest flag, in bold.** The dawn segment walks the edge of
the no-alarm constraint, and the design must be paranoid about it: the dawn
drift is opt-in, defaults off, is forbidden from ever increasing total
loudness above the scene's normal level, and must remain pleasant to sleep
*through* — it is scenery, not signal. If a future tweak ever makes it
reliable as a waking mechanism, it has become an alarm and must be cut. The
pre-dawn 80% of the feature (receding weather, deep-night scene changes) has
no such tension and is pure "let me stay there."

**Difficulty.** 3–4 weeks on top of ideas 2 and 10. The riskiest and most
original thing in this document. No competing app can do it, because no
competing app has a sample-accurate scene crossfade engine sitting under a
never-repeating soundscape.

---

### 17. A Voice You Know (cloned narrators)

**Pitch.** ElevenLabs instant voice cloning means the serial (idea 8) could be
read in *your own voice* — or, with explicit consent, a partner's or parent's.
There is no sound on earth more soporific to most people than a familiar
voice reading slowly in the dark; it's the original sleep technology. The
flow stays daytime-gated and deliberately heavyweight: record three minutes
of reading in Settings, the clone becomes one more entry in
`STORY_VOICE_IDS`, and every existing pipeline feature — chunked PCM
normalization, Projects fallback, the prosody marker stripping — works
unchanged because a voice is just a `voiceId` string.

**Builds on.** The voice maps in `storyGenerator.ts` are env-driven string
records — adding a runtime-stored cloned voice id is a small storage change
(`src/storage/apiKeys.ts` shows the pattern for sensitive local-only
strings); ElevenLabs IVC API uses the same `xi-api-key` auth already in
place; `tools/normalize-voice-audio.ts` already exists for voice-sample
hygiene.

**The One Thing.** For the right user, the strongest version of "put me to
sleep" in this entire document. **Honest flags:** consent is non-negotiable
(only clone voices whose owner records the sample themselves, in-app); some
people find their *own* cloned voice arousing rather than soothing — make
trying it cheap and abandoning it cheaper; and it deepens dependence on a
paid third-party API for the app's most intimate feature.

**Difficulty.** ~1 week of plumbing; the real cost is the care in the consent
UX.

---

## Anti-ideas — recommended against, on purpose

### A1. Sleep tracking, sleep scores, or microphone-based sleep detection

The gravitational pull toward "we're already running all night — we could
*listen*" must be resisted forever. It violates the brief three ways at once
(telemetry-adjacent, performance metrics, and a mic hot in your bedroom), it
murders the battery budget that `latencyHint: 'playback'` fights for, and —
the product reason — *measurement is arousal*. The instant the app scores
your night, you start performing sleep for it, which is clinically
counterproductive (orthosomnia is real). The Morning Letter (idea 6) is the
absolute ceiling: one paragraph about what the *app* did, never about what
*you* did, retained for zero days. TODO_PHASE2 D13 already said "Don't."
It remains "Don't."

### A2. A smart alarm / sunrise wake feature

It will be suggested — by users of other apps, by the symmetry instinct
("you handle falling asleep, why not waking?"), by the existence of the
Quiet Program's dawn drift (16). No. "No alarm" is a load-bearing identity
constraint, not a missing feature: the moment the app can wake you, every
design decision afterward gets bent toward reliability-of-waking (volume
floors, notification fallbacks, "did the alarm fire?" anxiety — the exact
3 a.m. failure modes this app exists to delete). The phone already has the
world's most-tested alarm clock. Let it keep that job. The dawn drift stays
legal only as long as sleeping through it is a success state.

### A3. Cloud sync, shared scene links, or any community/social layer

"Share this scene as a link" looks free — `SceneDefinition` is pure JSON and
was designed to round-trip. But the second scene-sharing exists, the roadmap
sprouts accounts, a backend, moderation, link previews, and a reason to open
the app *socially* — i.e., during the day, for dopamine, which retrains what
the app icon means to your nervous system. The app icon must mean *bed*.
For a single-user personal app, "sync" is `git` and "share" is pasting JSON
into a message — the Workbench's Export button (13) is the entire correct
implementation of this feature.

### A4. Voice control ("just say 'play the rain'")

Tempting for the eyes-closed context, but it requires a hot microphone all
night (see A1), wake-word processing burns the battery the 8-hour session
needs, and recognition errors at 3 a.m. are catastrophically worse than a
44-pixel button (imagine it *mishearing* and starting the monsoon at full
volume). The 3 a.m. Door (idea 1) solves the same need — minimal-cognition
resumption — with one tap and zero sensors.

---

## The v1.1 trio

Build these three next. Together they cover the entire arc of a night, they
are all composable from machinery that already exists, and each one makes the
later tiers cheaper.

1. **The 3 a.m. Door (idea 1).** The "stay there" half of the One Thing is
   currently the app's least-served promise, and this serves it for the cost
   of a weekend. It also establishes the deep-night window concept in
   `bedtime.ts` that the Quiet Program will eventually need.

2. **Night Drift (idea 2).** The cheapest possible proof of the app's biggest
   future thesis — that the *night itself* can be composed. It ships using
   three scenes you already have and the crossfade you already wrote, and it
   is the direct ancestor of Weather Systems and the Quiet Program. If Drift
   feels magical (it will), the Tier 3 roadmap is validated for free.

3. **Narration Sundown (idea 3).** One gain ramp that fixes the story
   pipeline's only real sleep-interruption defect, and the prerequisite for
   Described Nights and the Serial to feel finished. Stories become
   end-to-end seamless: generated by day, submerged by night.

Why they compound: the Door handles waking, Drift handles the middle of the
night, Sundown handles the falling-asleep seam — after this trio, every
minute from lights-out to morning has a feature whose only job is to be
unnoticeable. That is the product. Everything in Tiers 2 and 3 is then
deepening, not patching.

*(Honorable mention for the same release if there's appetite for a fourth:
Scene Doctor (idea 5) — zero user-facing surface, but it locks the vault on
the engine's core guarantee before the scene catalogue grows.)*
