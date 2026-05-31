#!/usr/bin/env python
# gen-singing-bowl.py — generate singing-bowl sound bath stems with Meta's
# audiocraft (MusicGen-medium), one stem per call.
#
# Why MusicGen and not AudioGen: AudioGen is 16 kHz SFX-trained and struggles
# on sustained pitched tones; MusicGen is 32 kHz and was trained on long-form
# music including drone/ambient material — the practitioner consensus for
# bowl-type drones. (See research notes in commit body.)
#
# Why medium and not large: large is "marginally better on objective metrics"
# per Meta's own docs, and at ~2-5 min per generation on consumer GPUs it's
# not worth the wait. Medium hits the quality/throughput knee.
#
# Generation knobs are tuned per the practitioner consensus for drone content:
#   - temperature = 0.9     (lower than 1.0 default → less wandering)
#   - cfg_coef    = 4.5     (higher than 3.0 default → stricter prompt adherence,
#                            specifically the "no percussion" negatives)
#   - top_k       = 250     (default; nucleus sampling off)
#   - Multi-Band Diffusion decoder for cleaner sustained tones.
#
# Long-form strategy: render N independent 75-90 s variants per element, then
# the project's existing FileLayer + prime-offset loop machinery does the
# seam-hiding (per CLAUDE.md "incommensurate-loops" rule). We do NOT use
# MusicGen's autoregressive continuation past ~60s — Meta's docs flag
# rhythmic drift past that, and the project's looping engine doesn't need it.
#
# Output: 32 kHz stereo WAV per stem, in raw-sounds/singing-bowl-gen/.
# Transcode + acrossfade-extend + sidecar write is the next step
# (see tools/grow-out-singing-bowl.sh).

import argparse
import os
import sys
import time
from pathlib import Path

import torch
from audiocraft.data.audio import audio_write
from audiocraft.models import MusicGen


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out-dir", type=Path,
                   default=Path(__file__).resolve().parent.parent
                       / "raw-sounds" / "singing-bowl-gen",
                   help="Where to write the generated WAVs.")
    p.add_argument("--seconds", type=int, default=75,
                   help="Seconds per stem. 60-90 is the sweet spot; >90 drifts.")
    p.add_argument("--model", type=str, default="facebook/musicgen-medium",
                   help="MusicGen model id. medium is the practitioner pick.")
    p.add_argument("--seed-base", type=int, default=20260531,
                   help="Base RNG seed; each stem increments from here so reruns "
                        "are reproducible per stem.")
    p.add_argument("--temperature", type=float, default=0.9)
    p.add_argument("--cfg-coef", type=float, default=4.5)
    p.add_argument("--top-k", type=int, default=250)
    p.add_argument("--only", type=str, default=None,
                   help="Stem id to generate alone (skip the rest). Useful for re-runs.")
    return p.parse_args()


# Stems we want to render. Two element groups:
#
#   bowl-drone-*   — primary continuous deep-bronze drone, will loop @ 251s
#   bowl-shimmer-* — higher-pitched bowls with overtone shimmer, loops @ 409s
#
# Three drone variants and two shimmer variants gives variantRotation 'random'
# something to actually rotate between, with the prime offsets carrying the
# incommensurate-loops property across both elements.
STEMS = [
    {
        "id": "bowl-drone-1",
        "prompt": (
            "deep Tibetan singing bowl drone, sustained bronze resonance, "
            "long sustain, low fundamental with warm overtones, meditation "
            "sound bath, instrumental only, no percussion, no drums, no melody, "
            "no rhythm, steady dynamics, seamless ambient"
        ),
    },
    {
        "id": "bowl-drone-2",
        "prompt": (
            "deep bronze singing bowl, slow sustained drone, dark warm timbre, "
            "low fundamental tone, soft beating overtones, meditation soundscape, "
            "instrumental only, no percussion, no drums, no melody, no rhythm, "
            "steady, seamless"
        ),
    },
    {
        "id": "bowl-drone-3",
        "prompt": (
            "Himalayan singing bowl held tone, deep resonant drone, mellow "
            "fundamental, gentle harmonic shimmer, meditative ambient bed, "
            "instrumental only, no percussion, no drums, no rhythm section, "
            "no melodic change, steady, seamless"
        ),
    },
    {
        "id": "bowl-shimmer-1",
        "prompt": (
            "crystal singing bowl, bright sustained overtones, slow shimmering "
            "harmonics, high airy timbre, meditation sound bath ambience, "
            "instrumental only, no percussion, no drums, no melody, no rhythm, "
            "steady, seamless"
        ),
    },
    {
        "id": "bowl-shimmer-2",
        "prompt": (
            "set of small bronze singing bowls, gentle held tones, slow "
            "overtone beating, mid-high airy resonance, meditation ambient bed, "
            "instrumental only, no percussion, no drums, no melody, no rhythm, "
            "steady, seamless"
        ),
    },
]


def main() -> int:
    args = parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("WARNING: CUDA not available; MusicGen on CPU is multi-minute "
              "per clip. Aborting — flip to a CUDA box.", file=sys.stderr)
        return 2

    print(f"[gen-singing-bowl] device={device} model={args.model}")
    t0 = time.time()
    model = MusicGen.get_pretrained(args.model, device=device)
    model.set_generation_params(
        duration=args.seconds,
        temperature=args.temperature,
        cfg_coef=args.cfg_coef,
        top_k=args.top_k,
        use_sampling=True,
    )
    print(f"[gen-singing-bowl] model loaded in {time.time()-t0:.1f}s")

    stems = [s for s in STEMS if args.only is None or s["id"] == args.only]
    if args.only and not stems:
        print(f"ERROR: --only {args.only!r} matched no stem id.", file=sys.stderr)
        return 2

    for i, stem in enumerate(stems):
        seed = args.seed_base + i
        torch.manual_seed(seed)
        if device == "cuda":
            torch.cuda.manual_seed_all(seed)

        out_stem = args.out_dir / stem["id"]
        out_wav = out_stem.with_suffix(".wav")
        print(f"[gen-singing-bowl] {stem['id']} seed={seed} -> {out_wav.name}")
        t = time.time()
        wav = model.generate([stem["prompt"]], progress=True)
        # wav shape: [batch, channels, time]. MusicGen is mono; audio_write
        # handles WAV PCM_S16 without needing torchcodec.
        audio = wav[0].cpu()
        # audio_write applies peak normalization with 1 dB headroom by
        # default — that gives consistent levels across stems before the
        # loudnorm pass in build-singing-bowl-scene.sh.
        audio_write(
            str(out_stem),
            audio,
            sample_rate=model.sample_rate,
            format="wav",
            strategy="peak",
        )
        # Sidecar with the exact prompt + params so the audio is reproducible.
        sidecar = out_wav.with_suffix(".prompt.txt")
        sidecar.write_text(
            f"model: {args.model}\n"
            f"seed: {seed}\n"
            f"duration_s: {args.seconds}\n"
            f"temperature: {args.temperature}\n"
            f"cfg_coef: {args.cfg_coef}\n"
            f"top_k: {args.top_k}\n"
            f"sample_rate: {model.sample_rate}\n"
            f"prompt: {stem['prompt']}\n",
            encoding="utf-8",
        )
        print(f"[gen-singing-bowl]   wrote {out_wav.name} ({time.time()-t:.1f}s)")

    print(f"[gen-singing-bowl] done in {time.time()-t0:.1f}s total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
