# Local TTS engine audition (2026-09-14)

Kokoro lost to ElevenLabs under a scene bed, so the other four local engines
from `notes/tts-research-2026-09-12.md` §6 get the same test. This records
what was built, what was measured, and what is waiting on Andrew's ear.

**Nothing here is a quality verdict.** Quality is his call; these are the
measurements that say whether each candidate is even eligible.

## The set

23 files staged in `/tmp/audition2/send`, not yet sent (Taildrop fires one
Android notification per file, and this was finished after midnight).

- `BED-*` — the decisive comparison: every render under the real
  `rain-on-window` scene at the app's shipped levels, plus
  `BED-ELEVENLABS-stone` as the yardstick.
- `DRY-*` — the same renders bare, for judging voice character.

## What was held constant

Everything except the voice, which is the only way the comparison means
anything:

| | |
|---|---|
| passage | identical, 342 words, `notes/audition-passage.txt` |
| pace | **exactly 125.0 wpm on every file**, no exceptions |
| gaps | 0.6 s, inserted by the tool, never asked of the model |
| level | loudness-normalised to the library's -19.5 LUFS |
| references | 20 s each, all normalised to -23 LUFS (they arrived 15 dB apart) |
| bed | same scene, same variants, same levels, `tools/bedmix.py` |

Pace is exact because engines cannot be *asked* for a rate — Kokoro's `speed`
lever proved discontinuous. Each renders at its natural rate, gets measured,
and the speech only is pitch-preserving stretched, so the inserted pauses keep
their length. See `tools/tts-audition.py`.

## Measured

Natural rate before the stretch. Every render verified by transcript
(`tools/tts-verify.py`); the range across all 11 was 0.949-0.988 similarity,
all passing.

| engine | default | stone ref | herzog ref | british ref |
|---|---|---|---|---|
| StyleTTS2 | 174.4 | 156.1 | 151.5 | 142.5 |
| Chatterbox | 235.2 | 153.9 | 203.5 | 142.1 |
| XTTS v2 | (none) | 132.5 | 129.7 | 150.3 |
| Higgs v3 | 113.6 | pending | pending | pending |

**Every engine tracks its reference's pace.** This matters more than it
looks: Chatterbox's default voice reads at 235 wpm and reaching 125 would
need a 0.53x stretch, well past where rubberband smears consonants. With the
`stone` reference it runs 153.9 and needs a comfortable 0.80x. So the pace
problem belongs to its default voice, not the engine — a conclusion that was
wrong on first measurement and corrected only because the reference renders
were run.

**XTTS sits closest to 125 unprompted** (129.7-150.3), so it needs the least
stretch of the three local engines and carries the least risk of smearing.

## Practicality

| engine | speed | note |
|---|---|---|
| Kokoro | 60x realtime | the whole library re-renders in seconds |
| StyleTTS2 | ~2.5x | four renders in 3 minutes |
| XTTS v2 | ~0.9x | ~2.5 min per render |
| Chatterbox | ~0.6x | ~3 min per render, and it watermarks every output |
| Higgs v3 | very slow | >16 min for one passage on a 4080; measurement pending |

Anything below Kokoro's 60x ends "re-render the library on a whim". At
StyleTTS2's rate the library is an overnight job; at Higgs' rate it may not
be feasible at all.

## Licences — all three usable, none unencumbered

- **Chatterbox** — MIT. Clean. But **it watermarks every output** (Resemble's
  Perth), which is fine for a personal app and should be known.
- **XTTS v2** — Coqui CPML, non-commercial. Its loader prompts interactively;
  agreeing is agreeing to the CPML. `COQUI_TOS_AGREED=1` is the documented
  non-interactive equivalent and is what the batch sets.
- **StyleTTS2** — code is MIT, but the `yl4579/StyleTTS2-LibriTTS` weights
  repo **ships no licence file at all**. Unresolved; fine for personal use,
  would need answering before anything else.
- **Higgs v3** — Boson research/non-commercial, which explicitly names
  "personal use (i.e., hobbyist projects)". In scope while SleepApp stays a
  one-user app, out of scope the moment it isn't.

The common thread: **three of the four are personal-use-only.** That is
acceptable under the current brief and it silently narrows what SleepApp can
ever become.

## Also worth knowing

Higgs' transformers port logs `MISSING: those params were newly initialized
because missing from the checkpoint`. Some weights are randomly initialised
rather than loaded. That may or may not hurt output; it is a reason to weight
its result carefully rather than trust it.

## Open

1. **[ANDREW] Listen.** The `BED-*` files against `BED-ELEVENLABS-stone`
   answer whether local is good enough. The `DRY-*` files pick a voice.
2. **[ANDREW] Your own voice** was wanted as a reference and could not be
   found — not on tikiserv, not in digi-me (its `voice/` is a PLAN.md stub),
   not in writing-style (transcripts only), and not in a deep search of
   crane-desk's D:, user profile or GDrive. Deferred by his call.
3. Higgs' three reference renders are still running on crane-desk.
