#!/usr/bin/env python3
"""Find foreground intrusions in scene beds — birds, voices, machinery.

Scene audio is broadband noise: rain, surf, wind, fire. Anything narrow and
tonal in it is a foreground event the recordist could not avoid, and on a
loop it does not pass by — it returns every P seconds, all night, which is
exactly the metronome the incommensurate-loops design exists to prevent.

Andrew heard a trilling bird ten seconds into a rain-on-window bed mix. It
is real: `glass-3.opus` has three chirps in its 409 s loop, and `glass-1`
has three more.

Detection: per frame, how far the loudest bin in 2.5-9 kHz stands above that
frame's own median in the same band. Rain is flat across the band and scores
low; a bird is a narrow spike and scores high. Comparing a frame against
itself rather than against the file means a loud passage does not read as an
event.

This flags candidates, it does not judge them. A fire crackle and a gull are
both narrow. Listen before cutting anything.

    python tools/scan-tonal-events.py public/audio/**/*.opus
    python tools/scan-tonal-events.py --all      # the whole catalogue
"""
from __future__ import annotations

import argparse
import glob
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BAND = (2500, 9000)
SR = 48000
DEFAULT_THRESHOLD_DB = 30.0


def scan(path: Path, threshold: float):
    import librosa
    import numpy as np

    y, sr = librosa.load(str(path), sr=SR, mono=True)
    S = np.abs(librosa.stft(y, n_fft=4096, hop_length=2048))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
    band = (freqs >= BAND[0]) & (freqs <= BAND[1])
    Sb = S[band]
    # A spectral *peak*, not merely the loudest bin. Taking the max alone
    # makes a steep slope at the band edge look like an event: ocean far-2
    # produced 105 "events" all pinned within 100 Hz of the 2.5 kHz boundary,
    # where real bird calls sat at 5.3 kHz with a wide spread. Require the
    # winning bin to stand above the bins on BOTH sides of it, which a slope
    # never does.
    idx = Sb.argmax(axis=0)
    frames = np.arange(Sb.shape[1])
    interior = (idx > 2) & (idx < Sb.shape[0] - 3)
    left = Sb[np.clip(idx - 3, 0, None), frames]
    right = Sb[np.clip(idx + 3, None, Sb.shape[0] - 1), frames]
    peak = Sb[idx, frames]
    prominence = np.minimum(peak / (left + 1e-12), peak / (right + 1e-12))
    is_peak = interior & (20 * np.log10(prominence) > 6.0)

    ratio = 20 * np.log10(Sb.max(axis=0) / (np.median(Sb, axis=0) + 1e-12))
    ratio = np.where(is_peak, ratio, 0.0)
    times = np.arange(len(ratio)) * 2048 / sr

    # Material with almost no energy in the band breaks the ratio: a bass
    # rumble's band median is near zero, so any bin towers over it and the
    # whole file reads as one continuous "event". Require the peak to be
    # audible relative to the file overall before it can count.
    floor = np.percentile(S.max(axis=0), 50) * 10 ** (-35 / 20)
    ratio = np.where(Sb.max(axis=0) > floor, ratio, 0.0)

    events = []
    for t, r in zip(times, ratio):
        if r <= threshold:
            continue
        if events and t - events[-1][1] < 1.0:
            events[-1][1] = t
            events[-1][2] = max(events[-1][2], r)
        else:
            events.append([t, t, r])
    return events, len(y) / sr


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*")
    ap.add_argument("--all", action="store_true", help="every shipped variant")
    ap.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD_DB)
    ap.add_argument("--quiet", action="store_true", help="only files with hits")
    args = ap.parse_args()

    paths = [Path(p) for p in args.files]
    if args.all:
        paths = sorted(
            Path(p) for pat in ("*.opus", "*.mp3")
            for p in glob.glob(str(REPO / "public" / "audio" / "**" / pat),
                               recursive=True))
    if not paths:
        print("nothing to scan", file=sys.stderr)
        return 1

    total = 0
    for p in paths:
        events, dur = scan(p, args.threshold)
        total += len(events)
        if args.quiet and not events:
            continue
        try:
            rel = p.relative_to(REPO)
        except ValueError:
            rel = p          # scanning something outside the repo is fine
        print(f"{str(rel):<62} {len(events):>2} event(s)  {dur:.0f}s")
        for a, b, r in events[:10]:
            span = f"{a:.1f}s" if b - a < 0.5 else f"{a:.1f}-{b:.1f}s"
            print(f"    {span:>16}   {r:.1f} dB above band median")
    print(f"\n{total} candidate event(s) across {len(paths)} file(s). "
          f"Listen before cutting — a fire crackle looks like a gull.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
