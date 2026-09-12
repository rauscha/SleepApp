# TTS + narration research (2026-09-12)

Scope: pick a TTS engine and voices for a fixed, hand-made library of sleep
stories and meditations, and learn what sleep narration actually requires.

**Read the confidence markers.** A fan-out of research agents was cut short by
a spend limit, so this is a consolidated pass done directly. Much of what the
open web returned on this topic is content marketing for TTS vendors, which is
weak evidence. Findings are marked:

- **[VERIFIED]** — checked against a primary source or this repo.
- **[LIKELY]** — consistent secondary sources, worth acting on, cheap to test.
- **[UNVERIFIED]** — single or vendor-adjacent source. Audition, don't trust.

---

## 1. The ElevenLabs 405 has a root cause, and it is ours [VERIFIED]

Open since 2026-08 in `.handoff/PENDING-DECISIONS.md` ("ElevenLabs Projects
API returned 405"). The Projects API was renamed **Studio** and the paths
moved under `/v1/studio/`:

    POST https://api.elevenlabs.io/v1/studio/projects     <- current
    POST https://api.elevenlabs.io/v1/projects            <- what we call

`tools/gen-story.ts` still calls the old path in four places (project create,
content, convert, chapter audio — lines ~173, ~201, ~213, ~226, plus the
status poll at ~246). A 405 (method not allowed, rather than 404) is exactly
what a retired-but-still-routed path returns.

**So the long-form path was never actually broken — we were knocking on the
wrong door, fell back to chunked TTS, and wrote it off.** Worth fixing before
rendering anything: the Studio path is the one designed for multi-chapter
long-form with consistent prosody, which is precisely our problem.

Source: https://elevenlabs.io/docs/api-reference/studio/add-project

## 2. Chunk continuity has a documented mechanism [VERIFIED, with a caveat]

ElevenLabs documents "request stitching" for maintaining prosody across
chunks (`previous_text` / `next_text`):
https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching

Our chunked fallback does not appear to use it, which would explain audible
seams between chunks in long renders. **[UNVERIFIED]** one research pass
reported stitching is *not* available on the v3 model — check before choosing
v3, since that would be a reason to stay on an older model.

## 3. Model choice: stability beats expressiveness here [LIKELY]

Multilingual v2 is described as the most stable long-form model; v3 is newer
and more expressive. For sleep narration, expressiveness is a *defect* — the
craft sources below all say avoid tonal spikes. Start on v2, treat v3 as an
experiment, and confirm stitching support first (see above).

## 4. Narration craft — and a conflict with our own spec [LIKELY]

| parameter | research says | our `notes/voice-design.md` says |
|---|---|---|
| sleep narration rate | **≤ 90 wpm** | story 115–130, meditation 95–110 |
| general narration | 130–150 wpm | n/a |
| dynamic range | **under 10 dB** | not specified |
| duration | most sleep stories 20–40 min | our stories ~19 min |

**Our story voices may be too fast.** 115–130 wpm is close to ordinary
audiobook pace; the sources tie reduced sleep-onset latency to ≤90 wpm with
low-plot descriptive narrative. One source claimed 40–50 wpm, which is
implausibly slow (that is a word every ~1.3 s) — discount it, but the
direction is consistent. **Cheapest possible test: re-render one existing
story at ~90 wpm and A/B it against the shipped version.** No new writing.

Other craft points, consistent across sources:

- Pause between sentences so the listener's inhalation can sync to it — the
  pauses act as passive paced breathing. Our scripts already insert `[pause]`
  and `[softly]` markers every 2–5 sentences, which is the right shape.
- Avoid sudden spikes in tone or volume. Dynamic range under 10 dB.
- **Sameness of voice across episodes matters** — the listener's brain learns
  to associate one voice with sleep onset. This argues for picking ONE female
  and ONE male voice and staying with them, rather than five voices spread
  across the library as we have now.
- Low-plot, descriptive, nothing demanding attention. Already our house style.

Sources: https://narrationbox.com/blog/ai-voice-bedtime-story-apps ·
https://sleepcalculators.net/adult-bedtime-stories/ ·
https://noiz.ai/use-cases/en/sleep-story-narration-ai ·
https://writersaudiobookclinic.com/2024/10/29/the-power-of-pacing-and-timing-in-audiobook-narration/

## 5. Voices and settings [UNVERIFIED — audition required]

Named ElevenLabs library voices people rate for meditation/calm narration:
**Erin** (most often cited for meditation), plus **Bella**, **Jordan**,
**Bill** (legacy) and **Adam** for stable calm narration. The provider also
curates a category: https://elevenlabs.io/voice-library/meditation

**Settings conflict worth resolving by ear.** Review sources suggest
stability ~35–40% for long passages "to avoid monotonous delivery", and style
exaggeration 10–20% for meditation/ASMR. We currently use stability 0.75
(story) / 0.80 (meditation), style 0.0 — deliberately, per
`notes/voice-design.md`, to keep the voice from performing. For sleep,
monotony is arguably the *goal*, so our higher stability may well be correct
and the advice may be written for marketing voiceover. Do not change our
settings on the strength of a blog post; A/B one script.

Sources: https://nerdynav.com/elevenlabs-review/ ·
https://aivoicereview.com/blog/best-elevenlabs-voices-2026 ·
https://geratools.com/elevenlabs-voice-settings-guide

## 6. Local rendering is now genuinely viable [LIKELY]

Render hardware: tikiserv RTX 4060 Ti (8 GB), crane-desk RTX 4080 (16 GB).
Rendering is offline batch, so slow is fine.

| model | licence | VRAM | note |
|---|---|---|---|
| Kokoro-82M | Apache 2.0 | ~2–3 GB | called the best default open TTS of 2026; 54 voices; faster than real time |
| StyleTTS2 | MIT (check) | modest | reported best *long-form prosody* of the open models |
| Chatterbox (Resemble) | MIT | low (0.5B; Turbo 350M) | zero-shot cloning; blind-test claim below |
| XTTS v2.5 (Coqui) | Coqui CPML — **check, non-commercial terms** | 6–8 GB | still the cloning reference; 6 s of reference audio |
| Higgs v3 | **[UNVERIFIED]** research / non-commercial | ? | flagged by a research pass; read the licence before use |

The headline claim: the open-vs-commercial gap narrowed from 223 ELO (2023)
to **81 ELO by mid-2026**, and one blind study reports Chatterbox preferred
over ElevenLabs 65.3% to 24.5%. **Treat both numbers as vendor-adjacent
marketing until reproduced** — but the direction is clear enough that local
deserves a real audition, especially since it removes per-render cost and any
licensing question about replaying stored audio.

Everything in the table fits the 4060 Ti except possibly XTTS at the top of
its range; the 4080 is comfortable for all of it.

Sources: https://pinggy.io/blog/best_open_source_self_hosted_text_to_speech_models/ ·
https://www.bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models ·
https://localaimaster.com/blog/best-local-tts-models ·
https://openvoxai.com/blog/best-free-local-tts-models-2026

## 7. What I would do next, cheapest first

1. **Fix the Studio endpoints** in `tools/gen-story.ts` (4 paths). Free, and
   it reopens the long-form render path we thought was dead.
2. **Render one meditation script three ways** — current settings, ~90 wpm,
   and a local model (Kokoro first, it is the cheapest to stand up) — and
   listen on the phone in bed. One script, three files, one night.
3. **Then decide the voice pair.** Pick one female and one male and stay with
   them, per the "sameness" finding, rather than carrying five.
4. Only then render the 7 waiting meditation scripts.

Not researched, still open: whether to keep our five designed voices at all,
and Andrew's own cloned voice (PENDING-DECISIONS #3).
