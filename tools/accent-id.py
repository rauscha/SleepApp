#!/usr/bin/env python3
"""Identify the accent of a narration voice, for voice selection.

Runs two classifiers over the same 4-second windows and reports both a
logit-averaged verdict and the per-window vote spread:

  L1  camillebrl/european_accent_in_english_classification
      16-class *first language* of an English speaker (German, French,
      Dutch, ... plus Indian and Vietnamese). Answers "is this an L2
      speaker, and of what native language".
  EN  Jzuluaga/accent-id-commonaccent_ecapa
      16 regional *L1-English* accents (england, us, scotland, ...).
      Answers "if this is a native English speaker, from where".

Run controls of known provenance in the same invocation. Both models were
trained on human speech, so a TTS voice is out of distribution; the controls
are what say whether the reading transfers at all. If a model cannot place a
known-American synthetic voice, its verdict on an unknown one means nothing.

Neither model's confidence is a reliability signal. The L1 model's card
reports mean confidence 0.94 when correct against 0.86 when wrong, and
calibration was never addressed. Read the vote spread, not the number.

    python tools/accent-id.py TARGET.mp3 --control known.mp3=us ...
"""
from __future__ import annotations

import argparse
import importlib.util
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

import numpy as np
import torch

SR = 16000
CHUNK_S = 4.0
L1_REPO = "camillebrl/european_accent_in_english_classification"
EN_REPO = "Jzuluaga/accent-id-commonaccent_ecapa"


def to_wav16k(src: Path, dst: Path) -> None:
    """Decode anything to 16 kHz mono float wav. Both models require 16 kHz."""
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-ac", "1", "-ar", str(SR), str(dst)],
        check=True,
    )


def windows(x: np.ndarray, chunk_s: float = CHUNK_S) -> np.ndarray:
    """Every 4 s window at 50% hop, covering the whole utterance.

    The model ships a `predict` that caps at 12 windows; we want full
    coverage so the per-window spread is a real sample, not a subsample.
    """
    n = int(chunk_s * SR)
    if len(x) <= n:
        return np.stack([np.pad(x, (0, n - len(x)))])
    starts = range(0, len(x) - n + 1, n // 2)
    return np.stack([x[s:s + n] for s in starts])


def load_l1(device: str):
    from huggingface_hub import hf_hub_download
    path = hf_hub_download(L1_REPO, "modeling_accent.py")
    spec = importlib.util.spec_from_file_location("modeling_accent", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.AccentClassifier.from_pretrained_hub(device=device)


def load_en(device: str):
    from speechbrain.inference import EncoderClassifier
    return EncoderClassifier.from_hparams(
        source=EN_REPO,
        savedir=str(Path.home() / ".cache" / "speechbrain" / "commonaccent_ecapa"),
        run_opts={"device": device},
    )


@torch.no_grad()
def score_l1(model, wins: np.ndarray, device: str, batch: int = 8):
    logits = []
    for i in range(0, len(wins), batch):
        chunk = torch.from_numpy(wins[i:i + batch]).to(device)
        logits.append(model(chunk).float().cpu())
    return torch.cat(logits), model.labels


@torch.no_grad()
def score_en(model, wins: np.ndarray, device: str, batch: int = 8):
    labels = [model.hparams.label_encoder.ind2lab[i]
              for i in range(len(model.hparams.label_encoder.ind2lab))]
    logits = []
    for i in range(0, len(wins), batch):
        chunk = torch.from_numpy(wins[i:i + batch]).to(device)
        out = model.classify_batch(chunk)[0]
        logits.append(out.squeeze(1).float().cpu())
    return torch.cat(logits), labels


def report(name: str, logits: torch.Tensor, labels: list[str], top_n: int = 4) -> None:
    """Logit-averaged verdict plus how the individual windows actually voted."""
    probs = torch.softmax(logits.mean(0), dim=-1)
    order = probs.argsort(descending=True)[:top_n]
    votes = Counter(labels[int(i)] for i in logits.argmax(dim=-1))
    total = len(logits)

    print(f"  {name}: averaged over {total} windows")
    for i in order:
        lab, p = labels[int(i)], float(probs[i])
        won = votes.get(lab, 0)
        print(f"    {lab:<14} p={p:.3f}   won {won:>3}/{total} windows ({100*won/total:.0f}%)")
    spread = len([v for v in votes.values() if v >= max(1, total * 0.05)])
    print(f"    -> {labels[int(order[0])]}, with {spread} label(s) taking >=5% of windows")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="+", help="audio files to identify")
    ap.add_argument("--control", action="append", default=[],
                    metavar="FILE=EXPECTED",
                    help="a file whose accent is already known, to calibrate")
    ap.add_argument("--limit-seconds", type=float, default=None,
                    help="use only the first N seconds (for a fast smoke test)")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}\n")

    items = [(Path(t), None) for t in args.targets]
    for spec in args.control:
        path, _, expected = spec.partition("=")
        items.append((Path(path), expected or "?"))

    missing = [p for p, _ in items if not p.exists()]
    if missing:
        print("missing: " + ", ".join(str(m) for m in missing), file=sys.stderr)
        return 1

    print("loading models (first run downloads ~1.4 GB)...")
    l1, en = load_l1(device), load_en(device)
    print("loaded\n")

    with tempfile.TemporaryDirectory() as tmp:
        for path, expected in items:
            wav = Path(tmp) / (path.stem + ".wav")
            to_wav16k(path, wav)
            import soundfile as sf
            x, sr = sf.read(wav, dtype="float32", always_2d=True)
            assert sr == SR
            x = x[:, 0]
            if args.limit_seconds:
                x = x[:int(args.limit_seconds * SR)]
            wins = windows(x)

            tag = f"  [control, known: {expected}]" if expected else "  [TARGET]"
            print(f"{path.name}{tag}  {len(x)/SR:.0f}s")
            report("L1 (native language)", *score_l1(l1, wins, device))
            report("EN (region, if native)", *score_en(en, wins, device))
            print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
