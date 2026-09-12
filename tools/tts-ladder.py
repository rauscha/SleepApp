#!/usr/bin/env python3
"""Render one story at a ladder of speaking rates, to find the rate that works.

Why this exists
---------------
Measured against the shipped library, the story Andrew actually falls asleep
to (`night-train`) runs at 138 gross wpm — about 50% faster than the sub-90
that sleep-narration guidance calls for. His hypothesis is that he needs
enough words per second to occupy attention, and that narration he can
outpace leaves room for his mind to wander. See
`notes/tts-research-2026-09-12.md` §4b.

So: same text, same voice, only the pace changes. Two independent levers,
because gross wpm can be lowered either by slowing the speech or by
lengthening the gaps, and his hypothesis predicts those feel *different*:

  --lever speed   slower speech, gaps held short and constant
  --lever pause   speech held constant, gaps stretched

Both ladders land on the same gross-wpm targets, so comparing them isolates
which lever the listener is actually responding to.

`--classic` renders the arm the literature recommends — slow speech AND long
pauses — which is the thing Andrew expects to find unbearable.

Notes
-----
Gross wpm is words over *total* duration including gaps, because that is the
metric measured off the shipped files and the only one that survived scrutiny
(silence-detection pause stats did not — see the note's §4b caveat).

Our scripts carry `[pause]` and `[softly]` markers written for ElevenLabs.
Kokoro honours neither, so `[pause]` becomes real inserted silence here
(which is what makes pause length an exact lever) and `[softly]` is dropped
with a count reported — that delivery cue is simply lost on this engine.

Every output is loudness-normalised to the shipped library's level so the
comparison is about pace and not about one render being louder.

Run it under the GPU watcher:
    ~/tools/gpu-watch.py -- ~/venvs/tts/bin/python tools/tts-ladder.py ...
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'notes', 'tts-ladder')
# Matches the shipped stories (measured -19.4 to -20.3 LUFS integrated).
TARGET_LUFS = -19.5
SAMPLE_RATE = 24000          # Kokoro's native rate
DEFAULT_PAUSE_SECONDS = 0.6  # the "short gaps" constant for the speed ladder
CLASSIC_PAUSE_SECONDS = 2.5  # what the craft sources ask for
CLASSIC_WPM = 90
# The rungs are 5 wpm apart, so anything inside 0.75 is indistinguishable.
WPM_TOLERANCE = 0.75
MAX_REFINEMENTS = 5


def load_script(path):
    """Split on [pause] into segments; return segments, word count, softly count."""
    raw = open(path, encoding='utf-8').read()
    softly = len(re.findall(r'\[softly\]', raw))
    raw = re.sub(r'\[softly\]', ' ', raw)
    parts = [p.strip() for p in re.split(r'\[pause\]', raw)]
    segments = []
    for part in parts:
        # Blank lines are paragraph breaks; Kokoro chunks on them anyway, and
        # they read as gaps, so keep them as segment boundaries too.
        for block in re.split(r'\n\s*\n', part):
            block = ' '.join(block.split())
            if block:
                segments.append(block)
    words = len(re.findall(r"[A-Za-z0-9'’\-]+", ' '.join(segments)))
    return segments, words, softly


def synth(pipeline, segments, voice, speed):
    """Render every segment; return a list of float32 numpy arrays."""
    import numpy as np
    out = []
    for i, text in enumerate(segments):
        chunks = []
        for result in pipeline(text, voice=voice, speed=speed):
            audio = result.audio if hasattr(result, 'audio') else result[2]
            if audio is None:
                continue
            chunks.append(audio.detach().cpu().numpy()
                           if hasattr(audio, 'detach') else np.asarray(audio))
        if chunks:
            out.append(np.concatenate(chunks))
        if os.isatty(1):
            print(f'    segment {i + 1}/{len(segments)}', end='\r', flush=True)
    if os.isatty(1):
        # Clear the progress line only — writing spaces unconditionally also
        # erased the refinement messages when output was piped to a file,
        # which is exactly when you need to read them.
        print(' ' * 40, end='\r')
    return out


def assemble(segments_audio, pause_seconds, path):
    import numpy as np
    import soundfile as sf
    gap = np.zeros(int(pause_seconds * SAMPLE_RATE), dtype='float32')
    pieces = []
    for i, seg in enumerate(segments_audio):
        pieces.append(seg.astype('float32'))
        if i != len(segments_audio) - 1:
            pieces.append(gap)
    sf.write(path, np.concatenate(pieces), SAMPLE_RATE)


def normalise(src, dst):
    """Two-pass loudnorm to the shipped library's level, then MP3."""
    probe = subprocess.run(
        ['ffmpeg', '-hide_banner', '-nostats', '-i', src,
         '-af', f'loudnorm=I={TARGET_LUFS}:TP=-1.5:print_format=json',
         '-f', 'null', '-'],
        capture_output=True, text=True).stderr
    measured = {}
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', probe, re.S)
    if m:
        try:
            measured = json.loads(m.group(0))
        except ValueError:
            measured = {}
    if measured:
        af = (f"loudnorm=I={TARGET_LUFS}:TP=-1.5:linear=true"
              f":measured_I={measured['input_i']}"
              f":measured_TP={measured['input_tp']}"
              f":measured_LRA={measured['input_lra']}"
              f":measured_thresh={measured['input_thresh']}")
    else:
        af = f'loudnorm=I={TARGET_LUFS}:TP=-1.5'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                    '-i', src, '-af', af, '-ar', '44100', '-b:a', '128k', dst],
                   check=True)


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                          'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True).stdout
    return float(out.strip())


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('script', help='story text, e.g. public/stories/night-train.txt')
    ap.add_argument('--voice', default='bm_george',
                    help='Kokoro voice (default bm_george — British male, the '
                         'nearest available to the accented low read that works)')
    ap.add_argument('--lang', default='b', help="Kokoro lang_code: b=British, a=American")
    ap.add_argument('--wpm', default='120,125,130,135,140,145,150',
                    help='comma-separated gross wpm targets')
    ap.add_argument('--lever', choices=('speed', 'pause'), default='speed',
                    help='which knob moves to hit the target')
    ap.add_argument('--pause', type=float, default=DEFAULT_PAUSE_SECONDS,
                    help='gap seconds held constant for --lever speed')
    ap.add_argument('--base-speed', type=float, default=1.0,
                    help='speech speed held constant for --lever pause')
    ap.add_argument('--classic', action='store_true',
                    help=f'instead render the guidance arm: {CLASSIC_WPM} wpm '
                         f'with {CLASSIC_PAUSE_SECONDS}s gaps')
    ap.add_argument('--out', default=OUT_DIR)
    args = ap.parse_args()

    segments, words, softly = load_script(args.script)
    name = os.path.splitext(os.path.basename(args.script))[0]
    os.makedirs(args.out, exist_ok=True)
    print(f'{name}: {words} words in {len(segments)} segments '
          f'({softly} [softly] markers dropped — Kokoro cannot honour them)')

    from kokoro import KPipeline
    import torch
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'loading Kokoro on {device}...')
    pipeline = KPipeline(lang_code=args.lang, device=device)

    targets = ([CLASSIC_WPM] if args.classic
               else [float(x) for x in args.wpm.split(',')])
    manifest = []

    # One calibration render tells us the natural speech duration, which is
    # what lets both levers be solved exactly rather than guessed at.
    t0 = time.time()
    print(f'calibration render at speed {args.base_speed}...')
    base = synth(pipeline, segments, args.voice, args.base_speed)
    base_speech = sum(len(a) for a in base) / SAMPLE_RATE
    gaps = max(len(segments) - 1, 1)
    print(f'  speech {base_speech / 60:.1f} min at speed {args.base_speed} '
          f'({words / (base_speech / 60):.0f} wpm with no gaps), '
          f'{gaps} gaps, {time.time() - t0:.0f}s to render')

    for wpm in targets:
        total_target = words / wpm * 60
        lever = 'pause' if args.classic else args.lever
        if args.classic:
            pause = CLASSIC_PAUSE_SECONDS
            speech_needed = total_target - gaps * pause
            speed = base_speech / speech_needed if speech_needed > 0 else 1.0
            audio = None
        elif lever == 'speed':
            pause = args.pause
            speech_needed = total_target - gaps * pause
            if speech_needed <= 0:
                print(f'  {wpm} wpm: impossible with {pause}s gaps — skipped')
                continue
            # Kokoro's speed parameter is close to but not exactly linear in
            # duration, so solving once lands a couple of wpm off. The rungs
            # are only 5 wpm apart, so refine: measure what we actually got
            # and re-solve against that. A render is ~15 s on the 4060 Ti,
            # which is cheap enough to buy an exact ladder.
            speed = base_speech / speech_needed
            audio = None
        else:
            speed = args.base_speed
            pause = (total_target - base_speech) / gaps
            if pause < 0:
                print(f'  {wpm} wpm: needs negative gaps at speed {speed} — '
                      f'lower --base-speed. Skipped.')
                continue
            audio = base

        tag = 'classic' if args.classic else f'{int(wpm)}wpm-{lever}'
        stem = f'{name}-{tag}'
        mp3 = os.path.join(args.out, f'{stem}.mp3')

        # Measure the ENCODED file and re-solve against it, because that is
        # the artifact someone listens to. Closing the loop on the raw audio
        # instead left two rungs of the first ladder 7-10 wpm out and in the
        # wrong order, which would have quietly invalidated the experiment.
        for attempt in range(MAX_REFINEMENTS + 1):
            if audio is None or attempt > 0:
                audio = synth(pipeline, segments, args.voice, speed)
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                wav = tmp.name
            try:
                assemble(audio, pause, wav)
                normalise(wav, mp3)
            finally:
                os.unlink(wav)
            actual = duration(mp3)
            got_wpm = words / (actual / 60)
            if abs(got_wpm - wpm) <= WPM_TOLERANCE or attempt == MAX_REFINEMENTS:
                if abs(got_wpm - wpm) > WPM_TOLERANCE:
                    print(f'    WARNING: {stem} settled at {got_wpm:.1f} wpm, '
                          f'{got_wpm - wpm:+.1f} off target')
                break
            if lever == 'pause':
                # Absorb the residual in the gaps; speech is fixed here.
                pause += (words / wpm * 60 - actual) / gaps
                if pause < 0:
                    print(f'    {wpm} wpm unreachable at speed {speed}; skipped')
                    audio = None
                    break
            else:
                speed *= got_wpm / wpm
            print(f'    {stem}: {got_wpm:.1f} -> retry for {wpm:.0f} '
                  f'(speed {speed:.3f}, gaps {pause:.2f}s)')
        if audio is None:
            continue
        row = {'file': os.path.basename(mp3), 'targetWpm': wpm,
               'actualWpm': round(words / (actual / 60), 1),
               'lever': lever, 'speed': round(speed, 3),
               'pauseSeconds': round(pause, 2),
               'minutes': round(actual / 60, 1), 'words': words,
               'voice': args.voice}
        manifest.append(row)
        print(f'  {stem}.mp3  target {wpm:.0f} -> actual {row["actualWpm"]:.0f} wpm  '
              f'speed {row["speed"]}  gaps {row["pauseSeconds"]}s  '
              f'{row["minutes"]:.1f} min')

    path = os.path.join(args.out, f'{name}-manifest.json')
    existing = []
    if os.path.exists(path):
        try:
            existing = json.load(open(path))
        except ValueError:
            existing = []
    keep = [r for r in existing if r['file'] not in {m['file'] for m in manifest}]
    json.dump(keep + manifest, open(path, 'w'), indent=2)
    print(f'\n{len(manifest)} file(s) in {os.path.relpath(args.out, ROOT)}; '
          f'manifest {os.path.basename(path)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
