#!/usr/bin/env python3
"""Correct a TTS render's timbre toward a reference, by measurement.

Andrew on the Higgs renders: "sounds a little metallic in all these, maybe
something in the high frequencies? - I think it might be something that's
fixable post creation, to bring it more in line with how the audio from
elevenlabs is output."

It is, partly. Measuring speech-only frames against ELEVENLABS-stone, Higgs
sits about +2.3 dB hotter at 6-8 kHz — the presence and sibilance band — and
about 2.7 dB thinner at 500-1000 Hz. Bright on top over a hollow middle is
what "metallic" usually is, and both are correctable.

**One part is not correctable and this tool will not pretend otherwise.**
Every local engine here outputs at 24 kHz, so it has nothing whatsoever above
12 kHz, where ElevenLabs still carries content. That "air" cannot be restored
by EQ — there is no signal there to lift. What the tool does do is soften the
brick wall at Nyquist, because an abrupt cliff itself reads as digital.

Rather than hand-tuning, this measures both files per band, takes the
difference, and builds an ffmpeg `firequalizer` curve from it. Corrections
are capped (default 4 dB) so a bad measurement cannot wreck a voice, and the
bands above the source's Nyquist are never boosted.

    python tools/match-timbre.py in.wav out.wav --reference stone.mp3
    python tools/match-timbre.py in.wav out.wav --reference r.mp3 --report
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

SR = 48000
# Edges chosen to straddle the places voices actually differ: body, presence,
# sibilance, air.
EDGES = [0, 200, 500, 1000, 2000, 4000, 6000, 8000, 12000, 16000, 24000]
ANCHOR = 3          # normalise both files at 1-2 kHz, the speech core
MAX_CORRECTION_DB = 4.0


def profile(path: Path):
    """Band energies in dB, measured on speech frames only and normalised
    at the anchor band, so overall level never enters the comparison."""
    import librosa
    import numpy as np

    y, sr = librosa.load(str(path), sr=SR, mono=True)
    S = np.abs(librosa.stft(y, n_fft=4096, hop_length=1024))
    energy = S.sum(axis=0)
    # Gaps would drag every band down and differ per file; drop them.
    S = S[:, energy > np.percentile(energy, 55)]
    freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
    out = []
    for lo, hi in zip(EDGES[:-1], EDGES[1:]):
        m = (freqs >= lo) & (freqs < hi)
        out.append(10 * np.log10((S[m] ** 2).mean() + 1e-20))
    p = np.array(out)
    return p - p[ANCHOR]


def source_nyquist(path: Path) -> float:
    """Real bandwidth of the file, not its container rate — a 24 kHz engine
    upsampled to 48 kHz still has nothing above 12 kHz."""
    import librosa
    import numpy as np

    y, sr = librosa.load(str(path), sr=SR, mono=True)
    S = np.abs(librosa.stft(y, n_fft=4096, hop_length=1024)).mean(axis=1)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
    peak = S.max()
    live = freqs[S > peak * 10 ** (-60 / 20)]
    return float(live.max()) if len(live) else SR / 2


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("output", nargs="?")
    ap.add_argument("--reference", required=True)
    ap.add_argument("--max-db", type=float, default=MAX_CORRECTION_DB)
    ap.add_argument("--report", action="store_true", help="measure, do not write")
    ap.add_argument("--soften-cliff", action="store_true",
                    help="gently roll off toward the source's Nyquist. Measured "
                         "WORSE than leaving it alone on Higgs (it pulled "
                         "8-12 kHz down 3.4 dB), so it is off by default.")
    args = ap.parse_args()

    import numpy as np

    src, ref = Path(args.source), Path(args.reference)
    for p in (src, ref):
        if not p.exists():
            sys.exit(f"no such file: {p}")

    ps, pr = profile(src), profile(ref)
    nyq = source_nyquist(src)
    delta = np.clip(pr - ps, -args.max_db, args.max_db)

    print(f"source bandwidth: {nyq/1000:.1f} kHz")
    print(f"{'band':<14}{'source':>9}{'ref':>9}{'correction':>12}")
    entries = []
    for i, (lo, hi) in enumerate(zip(EDGES[:-1], EDGES[1:])):
        # Never boost a band the source does not actually occupy: there is no
        # signal there and the lift would only raise noise.
        applied = 0.0 if lo >= nyq else float(delta[i])
        note = "  (above source Nyquist)" if lo >= nyq else ""
        print(f"{lo}-{hi:<9}{ps[i]:9.1f}{pr[i]:9.1f}{applied:+11.1f} dB{note}")
        centre = (lo + hi) / 2
        entries.append(f"entry({centre:.0f},{applied:.2f})")

    if args.report:
        return 0
    if not args.output:
        sys.exit("give an output path, or pass --report")

    curve = ";".join(entries)
    chain = f"firequalizer=gain_entry='{curve}'"
    if args.soften_cliff:
        # An abrupt cutoff at Nyquist can itself read as digital. But a 1-pole
        # filter starts working an octave early: on Higgs this cost 3.4 dB
        # across 8-12 kHz, trading one audible fault for another. Opt-in only.
        chain += f",lowpass=f={max(nyq - 500, 4000):.0f}:poles=1"
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-af", chain, "-ar", "48000", str(out)], check=True)
    print(f"\n-> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
