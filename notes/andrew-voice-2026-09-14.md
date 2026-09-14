# Cloning Andrew's voice (2026-09-14)

Andrew supplied his own recordings and asked for a "me" voice, with a caveat:
"that was question answering andrew - might need to tone it down (pitch) to my
bedtime story voice."

**22 files sent.** `DRY-*` and `BED-*` for each engine/pitch combination.

## Source

`crane-desk D:\RAUSCH_VOICE` — 31.7 minutes, 96 kHz mono 32-bit float, recorded
2026-06-17 for an ElevenLabs clone, with a booth-noise-reduced set already
prepared (`elevenlabs_booth_noise_reduced/`). The 20 s reference clips come
from `061626_012_TrMic_BoothNR.wav`, normalised to -23 LUFS like every other
reference.

## Pitch: the adjustment is measured, not guessed

| voice | median F0 | IQR |
|---|---|---|
| Andrew, question-answering | 98.5 Hz | 88-115 Hz |
| ELEVENLABS `stone` (his pick) | 87.9 Hz | 82-97 Hz |

He sits **2 semitones above** the voice he chose, and his pitch *range* is
nearly twice as wide — which is what "question answering" versus "bedtime
story" looks like. The chosen excerpt runs a little above his own average, so
on that clip **-3 semitones** is what lands on `stone`. Rungs shipped: 0, -2,
-3.

**Pitching down also slows the clone**, which was not expected: on XTTS the
same excerpt renders 196.6 wpm at 0 st, 177.6 at -2, 167.5 at -3.

## Pace: a Chatterbox problem, not an Andrew problem

The first attempt came out at ~235 wpm needing a 0.52x stretch — deep into
smearing. The obvious explanation, that he talks fast, is **wrong**: measured
by transcription his reference runs **147 wpm against `stone`'s 144**.

| engine | reference | natural wpm | stretch |
|---|---|---|---|
| XTTS v2 | andrew -3st alt | 155.3 | 0.805 |
| XTTS v2 | andrew -3st | 167.5 | 0.746 |
| XTTS v2 | andrew -2st | 177.6 | — |
| XTTS v2 | andrew 0st | 196.6 | — |
| StyleTTS2 | andrew -3st | 174.9 | 0.715 |
| StyleTTS2 | andrew -3st alt | 167.8 | 0.745 |
| Higgs v3 | andrew -3st | 167.3 | 0.747 |
| Chatterbox | andrew -3st alt | 205.6 | 0.608 |
| Chatterbox | andrew -3st | 237.4 | 0.527 |

**XTTS and StyleTTS2 render his voice with no smearing at all.** Only
Chatterbox inflates the rate, and a different source excerpt pulls it from 237
to 206 without fixing it. For normal-speech context: conversational English
runs 140-160 wpm, so 235 is genuinely abnormal and 125 is just below
deliberate-speech pace.

## One render was truncated and is NOT in the set

`higgs-andrew-3st-alt` scored 0.899 similarity and dropped eleven words
outright — "a little quieter than you remember, there is heat in the cabin".
Real truncation, silent, and the first defect `tools/tts-verify.py` has caught
in production rather than in its own testing. Pulled from the send.

## Method notes

- A 21-word probe was used at one point to compare references. It is
  worthless: on that text even `stone` measured 217 wpm against its 154 on the
  full passage. **Short texts render fast.** This is the third time in two
  days a short validation has misled about behaviour rather than crashes.
- Every file is timbre-matched to ElevenLabs (`tools/match-timbre.py`) and bed
  mixed over `rain-on-window` at a bird-free window, same as the engine
  audition, so the two sets are directly comparable.

## Open

1. **[ANDREW] Which pitch rung**, and whether any of this sounds like a
   bedtime voice rather than a lower-pitched question-answering voice.
2. If it still reads as "answering questions", the culprit is the **intonation
   range** (his IQR is nearly double `stone`'s), not the pitch. That is not
   fixable from a reference clip by shifting — it would need a differently
   delivered recording, i.e. actually reading a bedtime story.
