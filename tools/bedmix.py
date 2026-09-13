#!/usr/bin/env python3
"""Mix a narration take under a real scene bed, at the app's own levels.

For auditioning narration voices. A voice that sounds thin dry may be fine
once there is a room under it, so candidates have to be judged in place —
but only if "in place" is actually what the app does.

It reads the scene JSON rather than naming audio files, so the mix cannot
drift from what ships. The level chain it reproduces:

    narration      gain 1.0          (ContentPlayerScreen plays it at unity
                                      until the sundown ramp)
    each bed layer defaultVolume x master x bedAttenuation
    synth bed      synth.defaultVolume x master x bedAttenuation

with master 0.4 and bedAttenuation 0.5 as shipped, so a layer voiced at
0.60 lands at 0.12 against a full-scale voice.

Every candidate's narration is loudness-matched to the app's own
I=-19 LUFS target BEFORE the bed is added, and the sum is never
re-normalised. That keeps the voice-to-bed ratio identical across
candidates, so the only thing that varies between two audition files is
the voice itself.

    python tools/bedmix.py narration.mp3 out.mp3 --scene rain-on-window
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
NARRATION_LUFS = -19.0   # tools/normalize-voice-audio.ts
NARRATION_TP = -1.0
DEFAULT_MASTER = 0.4     # src/storage/settings.ts masterVolume
DEFAULT_ATTENUATION = 0.5  # ContentPlayerScreen bed attenuation default


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def pick_variant(element: dict, chosen: dict[str, str]) -> dict:
    want = chosen.get(element["id"])
    variants = element["variants"]
    if want:
        for v in variants:
            if v["id"] == want:
                return v
        sys.exit(f"scene has no variant {want!r} for element {element['id']!r}; "
                 f"have: {', '.join(v['id'] for v in variants)}")
    return variants[-1]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("narration")
    ap.add_argument("output")
    ap.add_argument("--scene", default="rain-on-window")
    ap.add_argument("--variant", action="append", default=[],
                    metavar="ELEMENT=VARIANT",
                    help="pin one element's variant; default is the last listed")
    ap.add_argument("--master", type=float, default=DEFAULT_MASTER)
    ap.add_argument("--attenuation", type=float, default=DEFAULT_ATTENUATION)
    ap.add_argument("--start", type=float, default=200.0,
                    help="seconds into each bed file to start, to skip any intro")
    ap.add_argument("--no-synth", action="store_true")
    args = ap.parse_args()

    chosen = dict(s.split("=", 1) for s in args.variant)
    scene_path = REPO / "public" / "scenes" / f"{args.scene}.json"
    if not scene_path.exists():
        sys.exit(f"no such scene: {scene_path}")
    scene = json.loads(scene_path.read_text())

    narration = Path(args.narration)
    if not narration.exists():
        sys.exit(f"no such file: {narration}")
    dur = duration(narration)
    scale = args.master * args.attenuation

    layers: list[tuple[Path, float, str]] = []
    for el in scene["elements"]:
        v = pick_variant(el, chosen)
        path = REPO / "public" / v["url"].lstrip("/")
        layers.append((path, el["defaultVolume"] * scale, f"{el['id']}/{v['id']}"))
    if not args.no_synth and "synth" in scene:
        color = scene["synth"]["color"]
        layers.append((REPO / "public" / "audio" / "_bed" / f"{color}.opus",
                       scene["synth"]["defaultVolume"] * scale, f"synth/{color}"))

    missing = [str(p) for p, _, _ in layers if not p.exists()]
    if missing:
        sys.exit("missing bed audio:\n  " + "\n  ".join(missing))

    print(f"scene {args.scene}, narration {dur:.0f}s, "
          f"master {args.master} x attenuation {args.attenuation}")
    for _, gain, name in layers:
        print(f"  {name:<40} {gain:.3f}")

    # Narration first, loudness-matched to the app target. linear=true keeps
    # loudnorm out of its dynamic mode, which pumps on a slow read.
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-i", str(narration)]
    for path, _, _ in layers:
        cmd += ["-ss", str(args.start), "-t", f"{dur:.3f}", "-i", str(path)]

    parts = [f"[0:a]loudnorm=I={NARRATION_LUFS}:TP={NARRATION_TP}:LRA=7:linear=true,"
             f"aresample=48000[voice]"]
    for i, (_, gain, _) in enumerate(layers, start=1):
        parts.append(f"[{i}:a]volume={gain:.4f},aresample=48000[b{i}]")
    bed_ins = "".join(f"[b{i}]" for i in range(1, len(layers) + 1))
    parts.append(f"{bed_ins}amix=inputs={len(layers)}:normalize=0:duration=first[bed]")
    # No loudnorm on the sum: re-normalising here would let a louder bed push
    # the voice down and make two candidates incomparable. A limiter only.
    parts.append("[voice][bed]amix=inputs=2:normalize=0:duration=first,"
                 "alimiter=limit=0.94[out]")

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd += ["-filter_complex", ";".join(parts), "-map", "[out]",
            "-ar", "48000", "-b:a", "128k", str(out)]
    subprocess.run(cmd, check=True)
    print(f"-> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
