# What is the `stone` voice? (2026-09-13)

Andrew's hypothesis: `stone` (the measured winner of the ElevenLabs voice
audition) is built on a Herzog-like accent — "German, but not a classic
German accent", probably tuned rather than cloned.

Two tools were built to test it. Both live in `tools/` and both are general,
not one-off: `accent-id.py` and `voice-similarity.py`.

**Answer: no Herzog, and no German. `stone` is a native-English voice,
England-leaning with an American pull.** The "tuned rather than cloned" half
of the hypothesis is supported; the German half is not.

## 1. Accent — `tools/accent-id.py`

Two classifiers over identical 4-second windows, logit-averaged, with the
per-window vote spread reported alongside because the averaged number alone
hides how much the windows disagreed.

### The L1 (native-language) model is unusable here, and a control proved it

`camillebrl/european_accent_in_english_classification` is a 16-class
classifier of a speaker's first language, `German` among them — exactly the
right shape for the question. It fails on this material:

| voice | its verdict | German p |
|---|---|---|
| Kokoro am_michael (known American) | Vietnamese 0.926 | — |
| Kokoro am_onyx (known American) | Vietnamese 0.961 | — |
| ELEVENLABS stone | Vietnamese 0.959 | 0.010 |
| **Werner Herzog, 180 s of real speech** | **Vietnamese 0.959** | **0.011** |

The Herzog control is decisive. A model that cannot find German in three
minutes of Werner Herzog cannot find German anywhere, so `stone`'s German
score of 0.010 was never evidence. Its 16 labels are all *non-English* first
languages with no native-English escape class, so a native English speaker
has to be assigned something and the whole set collapses onto an attractor
class. The model card documents attractor collapse under channel shift and
warns that confidence is not a reliability signal there (mean 0.94 when
correct against 0.86 when wrong, calibration never addressed). That is
precisely what happened.

**Lesson worth keeping: a classifier with no "none of the above" class will
answer confidently anyway.** Always run a positive control that the model
should get right, and a negative control it should have no class for.

### The regional model works, and ranks by how "pure" an accent is

`Jzuluaga/accent-id-commonaccent_ecapa`, 16 L1-English regional accents. All
three synthetic controls came out correct, so it reads synthetic speech.

| voice | top class | window agreement | labels >=5% |
|---|---|---|---|
| Kokoro bm_george+bm_lewis (synthetic British) | england | 100% | 1 |
| Kokoro am_michael (synthetic American) | us | 88% | 2 |
| Kokoro am_onyx (synthetic American) | us | 88% | 2 |
| **ELEVENLABS stone** | **england** | **72%** | **3** |
| Werner Herzog (real, German L2) | us | 46% | 4 |

Herzog is the negative control and behaves exactly as a non-native speaker
should against a model with no matching class: nothing wins, four labels take
a share. `stone` does not do that — at 72% it sits much nearer the native
voices. But it is the least concentrated of the natives (19% of its windows
vote `us`), which is what a *designed* voice looks like rather than one
cloned from a single region.

Caveat: the Herzog clips are older, noisier recordings, so some of his
scatter may be recording quality rather than accent. This does not touch the
L1 result above, which is what the German claim rested on.

## 2. Voice identity — `tools/voice-similarity.py`

Speaker-verification embeddings (`speechbrain/spkrec-ecapa-voxceleb`), cosine
similarity, with both anchors computed every run: a same-voice ceiling from
splitting each file in half, and the observed different-voice range.

| comparison | cosine |
|---|---|
| same voice, same recording (ceiling) | 0.95 – 0.99 |
| **Herzog vs himself, three different recordings** | **0.80** |
| stone vs am_michael | +0.238 |
| stone vs bm_george+lewis | +0.203 |
| **stone vs Herzog** | **+0.044** |
| observed different-voice range | -0.136 .. +0.238 |

Herzog-vs-himself at 0.80 across three mics and three eras is what makes the
rest readable: the model still recognises him as one person, so `stone`'s
0.044 is a real answer and not a recording-quality artifact. `stone` is in
fact *further* from Herzog than from a generic Kokoro American.

## Reproduce

```
~/venvs/accent/bin/python tools/accent-id.py TARGET.mp3 \
  --control known-american.mp3=us --control known-british.mp3=england
~/venvs/accent/bin/python tools/voice-similarity.py a.mp3 b.mp3 --label a.mp3=name
```

`~/venvs/accent` is Python 3.12 + torch 2.6.0+cu124. **Pin torchaudio to
2.6.0 explicitly** — installing `speechbrain` pulls torchaudio 2.11, which is
built against CUDA 13 and dies on `libcudart.so.13`.

Herzog reference audio was three public interview clips, used locally for
calibration and deleted afterwards.
