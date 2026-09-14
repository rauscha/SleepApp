#!/usr/bin/env python3
"""Remove narrow tonal intrusions from a scene bed, in place.

`scan-tonal-events.py` finds birds, gulls and other foreground events in the
broadband beds. This takes them out.

**Why repair rather than re-cut.** Each shipped variant is already trimmed to
its prime loop offset with a gapless 6 s fade-wrap baked in by
`loopify-scenes.py`. Re-cutting means re-deriving the loop start, re-checking
the wrap step, and re-verifying the offset — all of which can regress. A
spectral repair changes no sample count and leaves the wrap untouched, so the
loop contract is preserved by construction. It also works when the master is
not to hand, which for `glass-3` it is not.

**Method.** Rain is broadband and a bird is narrow, so in the STFT the bird
occupies a few bins in a few frames and the rain underneath it does not. For
each flagged event, the offending bins are replaced by the median magnitude
of the same bins in nearby clean frames — the rain that would have been there
— while the phase is kept, so the texture stays continuous. Only bins that
actually stand above their neighbours are touched; the rest of the band is
passed through untouched.

Stereo is processed per channel, so the image is preserved, and the output
is written with exactly the input's sample count.

    python tools/repair-tonal-events.py public/audio/.../glass-3.opus --in-place
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

N_FFT = 4096
HOP = 1024
BAND = (2000, 12000)
# How far above its time-neighbours a bin must sit before it is treated as
# intrusion rather than texture.
BIN_EXCESS_DB = 8.0
# Frames either side used to estimate what the bed was doing underneath.
CONTEXT_FRAMES = 40


def repair_channel(x, sr, events, pad_s: float):
    import librosa
    import numpy as np

    S = librosa.stft(x, n_fft=N_FFT, hop_length=HOP)
    mag, phase = np.abs(S), np.angle(S)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
    band = np.where((freqs >= BAND[0]) & (freqs <= BAND[1]))[0]
    n_frames = mag.shape[1]
    touched = 0

    for a, b, _ in events:
        f0 = max(0, int((a - pad_s) * sr / HOP))
        f1 = min(n_frames - 1, int((b + pad_s) * sr / HOP))
        lo = max(0, f0 - CONTEXT_FRAMES)
        hi = min(n_frames, f1 + CONTEXT_FRAMES + 1)
        # The bed's own level in each bin, taken from frames around the event.
        ctx = np.concatenate([mag[band, lo:f0], mag[band, f1 + 1:hi]], axis=1)
        if ctx.shape[1] < 8:
            continue
        bed = np.median(ctx, axis=1, keepdims=True)
        seg = mag[band, f0:f1 + 1]
        excess = seg > bed * 10 ** (BIN_EXCESS_DB / 20)
        if not excess.any():
            continue
        # Replace only the offending bins with the bed level. Everything else
        # in the window, including the rain in the same band, is untouched.
        seg = np.where(excess, np.broadcast_to(bed, seg.shape), seg)
        mag[band, f0:f1 + 1] = seg
        touched += int(excess.sum())

    out = librosa.istft(mag * np.exp(1j * phase), hop_length=HOP,
                        n_fft=N_FFT, length=len(x))
    return out, touched


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--output")
    ap.add_argument("--in-place", action="store_true")
    ap.add_argument("--threshold", type=float, default=30.0)
    ap.add_argument("--pad", type=float, default=0.15,
                    help="seconds of margin around each event")
    ap.add_argument("--bitrate", default="128k")
    args = ap.parse_args()

    import numpy as np
    import soundfile as sf
    from importlib import import_module
    scan_mod = import_module("scan-tonal-events".replace("-", "_")) \
        if False else None  # noqa - hyphenated module, loaded below

    # scan-tonal-events.py has a hyphen, so load it by path.
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "scan_tonal", Path(__file__).resolve().parent / "scan-tonal-events.py")
    scan_tonal = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scan_tonal)

    src = Path(args.audio)
    if not src.exists():
        sys.exit(f"no such file: {src}")
    if not args.in_place and not args.output:
        sys.exit("pass --output or --in-place")

    events, dur = scan_tonal.scan(src, args.threshold)
    if not events:
        print(f"{src.name}: nothing over {args.threshold:.0f} dB; unchanged")
        return 0
    print(f"{src.name}: {len(events)} event(s) in {dur:.0f}s")
    for a, b, r in events:
        print(f"    {a:7.1f}-{b:.1f}s   {r:.1f} dB")

    # Decode to float wav at native rate, keeping channels.
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        raw = tmp / "in.wav"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-i", str(src), "-c:a", "pcm_f32le", str(raw)], check=True)
        x, sr = sf.read(raw, dtype="float32", always_2d=True)
        n_before = len(x)

        out = np.zeros_like(x)
        total = 0
        for ch in range(x.shape[1]):
            out[:, ch], n = repair_channel(x[:, ch], sr, events, args.pad)
            total += n
        assert len(out) == n_before, "sample count changed; loop length would break"

        fixed = tmp / "out.wav"
        sf.write(fixed, out, sr)
        enc = tmp / ("out" + src.suffix)
        codec = ["-c:a", "libopus", "-b:a", args.bitrate] if src.suffix == ".opus" \
            else ["-b:a", args.bitrate]
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-i", str(fixed), *codec, "-ar", str(sr), str(enc)],
                       check=True)

        dest = src if args.in_place else Path(args.output)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(enc, dest)

    print(f"  replaced {total} bin(s) across {x.shape[1]} channel(s), "
          f"{n_before} samples preserved")
    print(f"  -> {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
