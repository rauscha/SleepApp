# Voice design — Hush / Ember / Glen / Tide / Stone

Specs for the five custom ElevenLabs voices that will replace the premade
stand-ins in `src/services/storyGenerator.ts` and `tools/gen-meditation.ts`.

These are designed in the [ElevenLabs Voice Design](https://elevenlabs.io/app/voice-lab)
portal, which generates a voice from a text prompt + a sample script. The
result is a stable `voice_id` we paste into the app config.

## Design philosophy

All five voices share the brief's "put me to sleep and let me stay there"
goal. None of them should sound like a podcast host, a wellness influencer,
or a guided-app celebrity narrator. The target reference is a single trusted
person reading aloud in a dark room, close to the listener.

Common constraints across all five:

- **Close-mic intimacy.** Implied proximity ~6 inches from the listener's ear.
- **Low energy floor.** Even the most "expressive" voice (Ember) stays under
  what a normal conversational read would deliver.
- **No upspeak, no smile in the voice, no broadcast polish.** These are
  bedside-table voices, not studio voices.
- **Honor [pause] and [softly] markers.** The scripts insert these every
  2–5 sentences (see `STORY_SYSTEM_PROMPT` and `buildPrompt` in
  `tools/gen-meditation.ts`). The voices need to read them as instructions,
  not artifacts.
- **Slow pace.** Story narration ~115–130 wpm, meditation ~95–110 wpm.

Story voices (Hush, Ember, Glen) read 2800–3200-word narratives — sustained
prose, dream-adjacent endings. Meditation voices (Tide, Stone) read 900–1100
word guided practices — instructional clarity matters more than mood.

Runtime voice settings already chosen (do not change at design time): story
stability 0.75 / similarity 0.75 / style 0.0; meditation stability 0.80 /
similarity 0.75 / style 0.0. The design prompt should produce a voice that
sounds right at those stability values — i.e. the voice's natural state
should already be slow and stable, not a performance the engine has to
clamp down.

---

## Hush — soft female, intimate close-mic story voice

**Design intent.** The "reading to you in the dark" voice. Hush is what
you'd want if a partner picked up a book at 11pm and started reading
softly so you'd fall asleep. Almost whispered in places — but full voice,
not breathy ASMR. Very close-mic, very still. Of the three story voices,
Hush carries the least narrative drive; it's the one to pick when the
listener is already nearly under.

**Gender / age / timbre.** Female, late 30s to early 40s. Soft warm mid-
register. Slight natural breathiness on quieter phrases but never crossing
into whisper-track territory. Neutral American accent with a faint
transatlantic edge — educated, unhurried, not regional.

**Delivery style.** Slow (~110–120 wpm). Long honoured pauses. Phrase
endings drift downward in pitch and often trail into near-silence.
No vocal smile. No emphasis spikes — even proper nouns are read level.
When the script has [softly], the next phrase drops noticeably in volume
without losing tone.

**Best use in app.** Story voice for intimate, interior settings:
winter cabins, small rooms, snow falling, blankets, candlelight. The
default first-pick for users who say "I have trouble falling asleep."
Pair with the Rain on Window and Fireplace scenes.

**ElevenLabs Voice Design prompt:**

> A female narrator in her late thirties, reading a bedtime story aloud
> in a quiet, dimly lit room very close to the listener's ear. Soft warm
> mid-register voice with a faint natural breathiness on quieter phrases.
> Neutral American accent with a slight transatlantic refinement, like a
> librarian or a literary translator — educated and unhurried, never
> regional or chirpy. Pace is slow and deliberate, around 115 words per
> minute, with long honoured pauses between sentences. Phrase endings
> drift downward in pitch and often trail toward silence. No vocal smile,
> no upspeak, no broadcast brightness, no emphasis spikes — even proper
> nouns are read level. The microphone is very close, perhaps six inches
> from the lips, which adds intimacy but not whisper-track ASMR breathiness.
> The overall effect is of a trusted partner reading the listener to sleep,
> with the knowledge that the listener will not hear the end of the chapter.

**Audition script:**

> The cabin held only what it needed. A kettle on the stove, a single chair
> turned toward the window, the soft weight of snow gathering against the
> sill. [pause] You set your hands flat on the wooden table and let them
> rest there, [softly] feeling the grain warm beneath your palms.

---

## Ember — warm storytelling female, slightly more narrative presence

**Design intent.** The fairy-tale-book voice. Ember is for stories that
have a sense of place to draw you into — a forest path, an old house, a
train moving through the dark. Slightly more vocal warmth and narrative
forward-motion than Hush, but still firmly inside sleep territory: no
performance, no characters, no dramatic shifts. Think of someone who
writes literary essays reading their own work aloud.

**Gender / age / timbre.** Female, mid-40s. Warmer chest resonance than
Hush — fuller mid-register, slight natural smoke without rasp. Could read
as Mid-Atlantic or softened British RP; both work. The voice should sound
"read aloud by someone who loves the sentences" rather than performed.

**Delivery style.** Measured, gently expressive (~120–130 wpm). Cadence
follows the sentence's natural rhythm rather than flattening it the way
Hush does — but the dynamic range is still narrow. Pauses are honored
fully. [softly] markers prompt a drop in volume and a slight slowing,
not a tonal shift. No characters voiced. No quoted dialogue is acted out.

**Best use in app.** Story voice for narrative-driven scripts with a
sense of place: forest paths, old houses, lighthouses, train cars,
seaside villages. The pick when the user asks for "a story about X"
rather than a mood. Pair well with the Forest Day scene.

**ElevenLabs Voice Design prompt:**

> A female narrator in her mid-forties, reading a literary sleep story
> aloud the way an essayist reads her own work at a small reading. Warm
> chest resonance, full mid-register, with a slight natural smoke in the
> voice — no rasp, no vocal fry. Accent is either softened American
> Mid-Atlantic or a quiet British received pronunciation that has lost
> its sharpness. Pace is around 125 words per minute, slow but not draggy,
> with cadence following the sentence's natural rhythm. Dynamic range is
> narrow: the voice is gently expressive without ever pushing into
> performance, drama, or audiobook polish. No characters are voiced; no
> quoted dialogue is acted. Pauses between sentences are long and
> honoured. The microphone is close but not as intimate as a whisper
> track — a thoughtful adult reading aloud to a single listener in a
> warm room with the lights low. The overall feeling is of someone who
> loves the sentences and is letting the listener fall asleep inside them.

**Audition script:**

> The path through the pines was older than the village, and the village
> was old. [pause] You walked it now the way generations had walked it,
> matching their slow steady steps without knowing it, the moss soft under
> each footfall. [softly] Somewhere ahead, water was moving over stones.

---

## Glen — deep resonant male, the grandfather voice

**Design intent.** The low, weighted voice of someone who has seen weather.
Glen carries safety through depth — the bass register itself does the
calming work. Imagine a mountain guide telling a story by the fire after
a long day, or a retired captain reading aloud from a journal. Of the
three story voices, Glen is the one for users who find female narration
distracting at sleep onset.

**Gender / age / timbre.** Male, late 50s to early 60s. Deep baritone
with warm natural gravel — not rough, not raspy, just lived-in. No vocal
fry. American Pacific Northwest or northern Midwest neutral works; quiet
British works too. Voice settles into its lower register at phrase ends
and stays there.

**Delivery style.** Slow (~115–125 wpm), weighted. Dropping into the bass
at the ends of phrases is characteristic. Long unhurried pauses; if
anything, leans toward letting silence sit a beat longer than expected.
Almost murmured on [softly] phrases. No theatrical menace, no stoic
hardness — the depth is comforting, not imposing.

**Best use in app.** Story voice for outdoor, weather-aware, masculine-
quiet settings: mountains, fishing cabins, lighthouses, long sea voyages,
night drives, harbor towns in fog. Also the right choice when the listener
needs the voice itself to feel structural — bass frequencies as ballast.
Pair with the Fireplace scene at lower wind levels.

**ElevenLabs Voice Design prompt:**

> A male narrator in his late fifties to early sixties, reading a sleep
> story aloud the way a grandfather tells a tale by the fire after a long
> day. Deep baritone voice with warm natural gravel — lived-in but never
> rough or raspy, and absolutely no vocal fry. Accent is neutral American
> Pacific Northwest or northern Midwest, or alternatively a quiet British
> received pronunciation; in either case the voice carries a sense of
> having been outdoors in weather. Pace is slow and weighted, around 120
> words per minute. The voice characteristically drops into its lower
> register at the ends of phrases and stays there, letting the bass do
> the calming work. Pauses between sentences are long and unhurried; on
> [softly] phrases the voice becomes nearly a murmur without losing depth.
> No theatrical menace, no stoic hardness, no broadcast authority — the
> depth is comforting, structural, the way a low pedal note grounds a
> piece of music. The microphone is close, capturing the chest resonance
> as well as the breath, like sitting next to the speaker in a small
> warm room at the end of the day.

**Audition script:**

> The boat had been tied up for hours, but the rope still creaked once
> in a while as the tide turned beneath the boards. [pause] You sat in
> the wheelhouse with the door cracked open, listening to nothing in
> particular. [softly] The lamp by your knee threw its yellow light only
> as far as it needed to.

---

## Tide — soft female meditation lead, instructional clarity

**Design intent.** The guided-meditation lead voice. Tide is where
instructional clarity matters more than mood: the listener needs to be
able to follow "draw a slow breath through the nose" without parsing
through performance. The cadence subtly mirrors the slow recurrence of
its namesake — rolling, even, returning to a baseline. Lower vocal
warmth than the story voices; clarity is the priority.

**Gender / age / timbre.** Female, mid-30s. Clear neutral tone, slight
natural airiness without breathiness. Mid-register, no chest weight.
Neutral American accent — no regional markers. The voice should sound
trustworthy without sounding like a wellness brand: closer to a yoga
teacher who teaches for ten years to small classes than to a meditation
app celebrity.

**Delivery style.** Slow (~100–110 wpm — meditation pace is markedly
slower than story pace). Cadence is even and gently rhythmic — long
phrase, brief pause, long phrase. Instructional verbs ("notice", "allow",
"let") are slightly emphasized but never spiked. [pause] markers get a
full beat, not a comma. [softly] phrases drop in volume but keep their
clarity — the listener still needs to hear the instruction. No vocal
smile.

**Best use in app.** Meditation voice for body-scan, breath-focus, and
visualization scripts where attentional clarity matters. The default for
users who prefer a female voice for guided practice. Currently powers
all three shipped meditations (`body-scan-01`, `forest-01` — see
`public/meditations/index.json`).

**ElevenLabs Voice Design prompt:**

> A female meditation teacher in her mid-thirties, leading a guided
> body-scan practice in a quiet room. Clear neutral mid-register voice
> with a slight natural airiness but no breathiness or whisper-track
> quality. Neutral American accent with no regional markers. Pace is
> very slow, around 105 words per minute — meditation pace, distinctly
> slower than narrative reading. Cadence is even and gently rhythmic:
> long instructional phrase, brief pause, long phrase, like the slow
> recurrence of a tide. Instructional verbs such as "notice", "allow",
> "let" carry a slight natural emphasis but are never spiked. Pause
> markers in the script should be honoured as full beats, not commas.
> When the script marks a phrase as softly spoken, the voice drops in
> volume but keeps its clarity — the listener still needs to hear the
> instruction. No vocal smile, no breathy yoga-app affect, no celebrity
> meditation-app polish — the voice should sound like an experienced
> teacher who has taught for ten years to small classes and trusts the
> practice to do the work.

**Audition script:**

> Allow your attention to settle gently into the feet. [pause] Notice
> the soft weight of them resting against the bed, and the slow warmth
> that gathers there as you let them soften. [softly] There is nothing
> to do here but rest.

---

## Stone — calm neutral male meditation voice, anchoring presence

**Design intent.** The anchoring meditation voice. Where Tide flows,
Stone holds. Steady, grounded, unmoving. Mid-baritone with no breathiness
and no warmth-seeking — the calm comes from stability, not affection.
Imagine a long-time vipassana teacher who has stopped trying to make the
voice sound calm and is simply calm.

**Gender / age / timbre.** Male, mid-40s. Mid-baritone with even
resonance — neither bright nor cavernous. No gravel, no breathiness, no
vocal fry. Neutral American accent, or quiet British received
pronunciation; either should sound trained but not performed. Voice
naturally sits at a steady volume rather than rising and falling.

**Delivery style.** Slow (~95–105 wpm — the slowest of the five
voices). Pacing is metronomic in feel without sounding mechanical:
each phrase lands with the same weight as the last. Pauses are slightly
longer than Tide's. [softly] markers reduce volume but the timbre
stays exactly the same — no breathy shift. No vocal smile, no
warmth-pushing. The effect should feel ceremonial in its evenness.

**Best use in app.** Meditation voice for breath-focus and visualization
practices where a male voice is preferred, or when the listener wants
the most grounding option. Currently powers the `breath-01` meditation
(see `public/meditations/index.json`). Best pairing: Fireplace scene at
a quiet level.

**ElevenLabs Voice Design prompt:**

> A male meditation teacher in his mid-forties, leading a slow breath-
> focus practice. Mid-baritone voice with even resonance — neither bright
> nor cavernous, with no gravel, no breathiness, and absolutely no vocal
> fry. Accent is neutral American or a quiet, untheatrical British
> received pronunciation; either way the voice sounds trained but never
> performed. Pace is the slowest of all the voices in the app, around
> 100 words per minute. Pacing is metronomic in feel without sounding
> mechanical: each phrase lands with the same weight as the last, and
> the voice sits at a steady volume rather than rising and falling. Pauses
> between sentences are long and honoured — slightly longer than a
> typical guided-meditation reading. When the script marks a phrase as
> softly spoken, the volume drops but the timbre stays exactly the same;
> there is no breathy shift, no character change. No vocal smile, no
> warmth-pushing, no audiobook performance. The overall effect should
> be of a long-time meditation teacher who has stopped trying to make
> the voice sound calm and is simply calm — the stillness is the message.

**Audition script:**

> Bring your attention to the breath, just as it is. [pause] Notice the
> long slow draw of the inhale, and the small still moment that follows
> before the exhale begins. [softly] You do not need to change anything.

---

## After designing — where the IDs go

Once each voice is designed and saved in ElevenLabs, paste the resulting
`voice_id` strings into these two locations:

1. `src/services/storyGenerator.ts:24-33` — `STORY_VOICE_IDS` (hush, ember,
   glen) and `MEDITATION_VOICE_IDS` (tide, stone).
2. `tools/gen-meditation.ts:42-45` — `VOICE_IDS` (tide, stone).

Then regenerate the three shipped meditations so they use the new voices
(commands in `USER_TODO.md` under "Generate meditations").
