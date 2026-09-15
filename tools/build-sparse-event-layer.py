#!/usr/bin/env python3
"""build-sparse-event-layer.py -- assemble a mostly-silent "event" layer.

Scene beds are continuous, but a few layers are not: distant thunder, an
occasional dockside clang. Those are built rather than found -- a handful of
events dropped into near-silence at chosen times, so the layer stays quiet
and the events stay rare.

The recipe was written down once, in the sidecar of monsoon's thunder-rumble
("two muffled thunder events ... positioned 60s and 320s into a 560s
mostly-silent track, 600 Hz low-pass ... rumble only, no sharp cracks"), and
then had to be reconstructed from that sentence the next time it was needed.
This is that sentence as a program.

Per event: low-pass, fade both ends, resample. Then each is delayed to its
position and summed over a silent base. The finished track is measured and a
single fixed gain lands it on the target loudness -- NOT loudnorm, whose
dynamic mode pumps badly on a track that is mostly silence, and whose linear
mode would still be a no-op here since one gain is all this needs.

Length: make the base comfortably longer than the loop offset it feeds, so
tools/loopify-scenes.py has slack to search a start offset. Its wrap needs
offset + 6 s at minimum; +30 s of slack is a good default.

    python tools/build-sparse-event-layer.py \
        --out /tmp/rumble-1.wav --length 230 --target-lufs -25 \
        --lowpass 600 \
        --event 45 "/path/to/thunder-13.ogg" \
        --event 150 "/path/to/thunder-25.ogg"
"""
import argparse
import json
import os
import re
import subprocess
import sys

SR = 48000


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def integrated_lufs(path):
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path,
             "-af", "ebur128=framelog=quiet", "-f", "null", "-"])
    m = re.findall(r"I:\s+(-?\d+\.?\d*) LUFS", r.stderr)
    if not m:
        sys.exit("could not measure loudness:\n" + r.stderr[-2000:])
    return float(m[-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--length", type=float, required=True,
                    help="total seconds; leave slack over the loop offset")
    ap.add_argument("--target-lufs", type=float, default=-25.0)
    ap.add_argument("--lowpass", type=float, default=600.0,
                    help="Hz; rumble only, no sharp cracks")
    ap.add_argument("--fade", type=float, default=2.0,
                    help="seconds of fade on each end of every event")
    ap.add_argument("--event", nargs=2, action="append", metavar=("AT", "FILE"),
                    required=True, help="position in seconds, then source file")
    a = ap.parse_args()

    events = [(float(at), path) for at, path in a.event]
    for at, path in events:
        if not os.path.exists(path):
            sys.exit(f"missing event source: {path}")
        if at >= a.length:
            sys.exit(f"event at {at}s falls outside a {a.length}s layer")

    # One filter graph: a silent base, every event low-passed, faded and
    # delayed, all summed. amix would divide by the input count and duck the
    # events; amerge+pan or a plain sum is what is wanted, so use amix with
    # normalize=0.
    inputs = []
    for _, path in events:
        inputs += ["-i", path]
    parts = [f"anullsrc=r={SR}:cl=stereo,atrim=0:{a.length}[base]"]
    labels = ["[base]"]
    for i, (at, path) in enumerate(events):
        parts.append(
            f"[{i}:a]aformat=sample_rates={SR}:channel_layouts=stereo,"
            f"lowpass=f={a.lowpass},"
            f"afade=t=in:st=0:d={a.fade},areverse,afade=t=in:st=0:d={a.fade},areverse,"
            f"adelay={int(at * 1000)}|{int(at * 1000)}[e{i}]"
        )
        labels.append(f"[e{i}]")
    parts.append(
        "".join(labels) +
        f"amix=inputs={len(labels)}:normalize=0:duration=first[mixed]"
    )
    graph = ";".join(parts)

    tmp = a.out + ".tmp.wav"
    r = run(["ffmpeg", "-y", "-hide_banner", "-nostats", *inputs,
             "-filter_complex", graph, "-map", "[mixed]",
             "-t", str(a.length), "-ar", str(SR), "-c:a", "pcm_s24le", tmp])
    if r.returncode:
        sys.exit(r.stderr[-3000:])

    measured = integrated_lufs(tmp)
    gain = a.target_lufs - measured
    r = run(["ffmpeg", "-y", "-hide_banner", "-nostats", "-i", tmp,
             "-af", f"volume={gain:.3f}dB", "-ar", str(SR),
             "-c:a", "pcm_s24le", a.out])
    if r.returncode:
        sys.exit(r.stderr[-3000:])
    os.remove(tmp)
    final = integrated_lufs(a.out)
    print(f"  {os.path.basename(a.out)}: {len(events)} event(s) in {a.length}s, "
          f"{measured:.2f} -> {final:.2f} LUFS (gain {gain:+.2f} dB)")

    side = {
        "lengthSeconds": a.length,
        "targetLufs": a.target_lufs,
        "measuredLufs": round(final, 2),
        "appliedGainDb": round(gain, 2),
        "lowpassHz": a.lowpass,
        "eventFadeSeconds": a.fade,
        "events": [{"atSeconds": at, "source": os.path.basename(p)}
                   for at, p in events],
        "builtBy": "tools/build-sparse-event-layer.py",
    }
    with open(os.path.splitext(a.out)[0] + ".build.json", "w",
              encoding="utf-8") as f:
        json.dump(side, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
