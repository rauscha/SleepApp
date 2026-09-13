#!/usr/bin/env python3
"""How similar are two voices? Speaker-embedding cosine, with calibration.

An accent classifier answers "where is this voice from". This answers the
different question "does voice A sound like voice B" — it embeds each voice
with a speaker-verification model (the same family used to decide whether
two recordings are the same person) and compares them directly.

A raw cosine is meaningless without anchors, so every run computes two:

  ceiling  each file split in half, the halves compared to each other.
           Same voice, same recording, different words -> as high as this
           setup can score. 
  floor    pairs of files known to be different voices.

A comparison is only interesting relative to those. "0.31" says nothing;
"0.31, against a 0.82 same-voice ceiling and a 0.28 different-voice floor"
says the two voices are unrelated.

    python tools/voice-similarity.py a.mp3 b.mp3 c.wav
"""
from __future__ import annotations

import argparse
import itertools
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch

SR = 16000
ECAPA = "speechbrain/spkrec-ecapa-voxceleb"


def to_wav16k(src: Path, dst: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-ac", "1", "-ar", str(SR), str(dst)],
        check=True,
    )


def load_encoder(device: str):
    from speechbrain.inference import EncoderClassifier
    return EncoderClassifier.from_hparams(
        source=ECAPA,
        savedir=str(Path.home() / ".cache" / "speechbrain" / "spkrec-ecapa"),
        run_opts={"device": device},
    )


@torch.no_grad()
def embed(model, x: np.ndarray, device: str, chunk_s: float = 8.0) -> torch.Tensor:
    """Mean of L2-normalised embeddings over 8 s chunks.

    Averaging normalised chunk embeddings, rather than embedding the whole
    file at once, keeps one loud passage from dominating the result.
    """
    n = int(chunk_s * SR)
    chunks = [x[s:s + n] for s in range(0, max(len(x) - n + 1, 1), n)]
    chunks = [c for c in chunks if len(c) >= n // 2] or [x]
    embs = []
    for c in chunks:
        t = torch.from_numpy(c).float().unsqueeze(0).to(device)
        e = model.encode_batch(t).squeeze()
        embs.append(torch.nn.functional.normalize(e, dim=-1))
    return torch.nn.functional.normalize(torch.stack(embs).mean(0), dim=-1)


def cos(a: torch.Tensor, b: torch.Tensor) -> float:
    return float(torch.dot(a, b))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--label", action="append", default=[], metavar="FILE=NAME",
                    help="short display name for a file")
    args = ap.parse_args()

    names = {}
    for spec in args.label:
        path, _, name = spec.partition("=")
        names[path] = name

    paths = [Path(f) for f in args.files]
    missing = [p for p in paths if not p.exists()]
    if missing:
        print("missing: " + ", ".join(map(str, missing)), file=sys.stderr)
        return 1

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_encoder(device)

    full, halves = {}, {}
    import soundfile as sf
    with tempfile.TemporaryDirectory() as tmp:
        for p in paths:
            wav = Path(tmp) / (p.stem + ".wav")
            to_wav16k(p, wav)
            x, sr = sf.read(wav, dtype="float32", always_2d=True)
            assert sr == SR
            x = x[:, 0]
            key = names.get(str(p), p.stem)
            full[key] = embed(model, x, device)
            mid = len(x) // 2
            halves[key] = (embed(model, x[:mid], device),
                           embed(model, x[mid:], device))

    keys = list(full)
    width = max(len(k) for k in keys) + 2

    print("\nSame-voice ceiling (each file's own two halves):")
    ceilings = []
    for k in keys:
        c = cos(*halves[k])
        ceilings.append(c)
        print(f"  {k:<{width}} {c:.3f}")
    ceiling = float(np.mean(ceilings))

    print("\nPairwise similarity:")
    pairs = []
    for a, b in itertools.combinations(keys, 2):
        pairs.append((cos(full[a], full[b]), a, b))
    for c, a, b in sorted(pairs, reverse=True):
        print(f"  {a:<{width}} vs {b:<{width}} {c:+.3f}")

    lo, hi = min(p[0] for p in pairs), max(p[0] for p in pairs)
    print(f"\n  same-voice ceiling        {ceiling:+.3f}")
    print(f"  observed pair range       {lo:+.3f} .. {hi:+.3f}")
    print("\n  Read a pair against the ceiling, not against zero. Everything in")
    print("  the observed range is a different-voice score; the spread inside")
    print("  that range is not a similarity ranking worth trusting, only the")
    print("  distance from the ceiling is.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
