# Pending decisions / queued actions

**What is open, and who it is waiting on.** Rewritten clean at v1.0.0
(2026-10-01). Everything closed before then, with its reasoning, is in
`DECISIONS.md`, or in this directory as it stood at tag `v1.0.0`
(`git show v1.0.0:.handoff/PENDING-DECISIONS.md`).

**Nothing blocks anything.** v1.0.0 is tagged and live. Every item below is
optional.

## Buildable without Andrew

- **A second variant for `waterfall-valley/falls-main`.** It ships one, and
  every other element has 2-5 for `variantRotation`. Its own master is only
  520 s, so a second 409 s window would repeat 300 s+ of the first. The pick
  (2026-10-06) is FTUS "WATRFall-L,R_Japan-Water, Waterfall, Spray, Forest,
  Calm, Relaxing, Meditative, Lush Greenery, Autumn, Kanazu, 02": 8:44
  stereo, no birds or voices in its metadata, 109 s of start-search slack.
  It is in the All In One bundle's 2026 update, `WATER/WATER_34/WATERFALL/`
  (192 kHz; also `WATER_11` in the 48/24 edition). **Waiting on Andrew to
  log in to Gumroad** in the remote browser (`~/remote-browser.sh start`);
  the old browser profile, and its login, are gone. Then: level with
  `level-ftus.py --alt-boundary`, screen (calls, speech, clicks), cut to
  409, seam-review, and send it for a listen before it ships.
- **C6: a whole-night soak watching for spectrum discontinuities.** Specified
  in May and never run as such. Mostly covered since: `tools/seam-review.py`
  checks every wrap in the scene mix, `loopify-scenes.py --audit` shows no
  holes and no steps over 3 dB, and Andrew's overnights are clean.

## Waiting on Andrew, when he wants it

- **His own voice for narration: not now** (Andrew, 2026-10-06). When he
  wants it: clone it in ElevenLabs, add the voice ID to `VOICE_IDS` in
  `tools/gen-meditation.ts` (and the story tool), and re-render with
  `--voice`. The reading passage is
  `git show v1.0.0:notes/voice-clone-read-2026-09-19.md`. Cloning a real
  voice is allowed only because the app is private.
- **An apartment-rain scene: screened 2026-10-06, waiting on Andrew's
  ear.** Both Singapore beds in `~/sounds/ftus/picked-2026-09-30/` are
  clear of speech (faster-whisper + VAD). The apartment bed (Tiong Bahru)
  has no tonal or call events. The metal-roof bed has three tonal spikes
  (103.5, 260, 292 s), birds or metallic pings, and 37 sharp transients
  that may simply be drops on metal. **Thunder is the problem in both,**
  and a high-pass doesn't fix it: the claps are broadband (apartment 31-35 s
  +20 dB over the 1 s median even above 250 Hz; 149-153 s +11; 222 s +10;
  metal roof 7-24 s up to +22, 118 s +11, 198 s +10, 280-293 s). On a 199 or
  251 s loop a clap returns every 3-4 minutes all night. Clean stretches:
  apartment 57-86, 88-148, 164-220, 231-285 s (about 200 s in all, marginal
  for a 199 s splice); metal roof 25-102, 120-197, 200-259 s (enough). So
  either bed means a spliced composite like glass-5, and thunder, if wanted,
  belongs on its own sparse layer at a long prime (as in monsoon). Both
  full recordings were sent to Andrew to hear.
- **Reserve photos,** unused but on-brief: the dark beach with a lighthouse
  glint (`IMG_1568`), night leaves (`L1010043`), and the second AI train
  (corridor). Originals are in `~/Taildrop/`, working copies in
  `~/incoming/photos-2026-09-30/`.

## Kept on purpose (do not clean up)

- **FTUS source packs** in `~/Downloads/remote-browser/`: the Immersive
  bundle's `ORTF3D_RAIN_01` and the All In One bundle's `RAIN_08` (glass) and
  `RAIN_11` (interior). The bundle's metadata map, which says which zip holds
  what, is unpacked at `~/sounds/ftus/aiob-meta/`. Andrew: "always have to
  watch for more need for scenes." `~/remote-browser.sh start` reopens a
  Gumroad browser on tikiserv for more.
