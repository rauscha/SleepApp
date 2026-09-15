#!/usr/bin/env python3
"""build-singing-bowl-scene.py -- assemble the singing-bowl scene from stems.

The bowls are the one scene with no field recording behind it: five ~75 s
MusicGen-medium stems in raw-sounds/singing-bowl-gen/, acrossfade-stitched
into beds long enough to carry a prime loop offset.

Rewritten 2026-09-15 from the original shell version, which shipped the three
worst seams in the catalogue -- shimmer-2 stepped 19.0 dB across its wrap,
drone-2 17.1, shimmer-1 10.1. Three things were wrong, and only the first is
about this scene:

  1. NO SLACK TO SEARCH. The shimmer stitch ran 435 s and was then trimmed to
     420 for a 409 s loop, leaving tools/seamfit.py a 5-second window to find
     a level-matched loop start in. It cannot; a bowl bed swells and decays
     over tens of seconds, so the start has to be free to move by tens of
     seconds. The stitches are now long enough that the search range is
     larger than the swell: shimmer 9 segments (555 s, 140 s of slack), drone
     7 segments (435 s, 178 s).

  2. SINGLE-PASS LOUDNORM IS DYNAMIC. `loudnorm=I=-25:LRA=7` in one pass runs
     ffmpeg's dynamic mode, which gates and pumps on long quiet material and
     can put level steps into the track it is meant to even out -- the same
     trap tools/level-ftus.py documents. A bed needs one number applied to
     the whole file, so this measures the stitch and applies a single gain.
     Nothing here compresses; the bowls keep their own dynamics.

  3. AN MP3 GENERATION NOBODY NEEDED. The old script wrote 44.1 kHz 128 kbps
     MP3, which loopify-scenes.py then re-encoded to Opus -- two lossy
     generations over a 32 kHz mono source. It now writes 48 kHz WAV and lets
     loopify do the only encode.

Run this, then `python tools/loopify-scenes.py`, which trims each bed to its
prime offset and converts to Opus.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = Path(os.path.expanduser("~/sounds/raw-sounds/singing-bowl-gen"))
OUT = ROOT / "public" / "audio" / "singing-bowl"
SR = 48000
XFADE = 15          # seconds, triangular, between stems
TARGET_TP = -1.5    # dBTP ceiling

# Targets for the ASSEMBLED bed, chosen so the 251/409 s slice loopify cuts
# from it lands where the shipped files already sat: the drone measured
# -25.0/-25.6/-26.1 LUFS and the shimmer -25.7/-25.9, and Andrew voiced
# defaultVolume against those by ear. The old script asked for -23 and -25
# and never got them -- its single-pass loudnorm ran dynamic mode and
# undershot by 2-3 dB -- so these numbers are the measured truth replacing a
# nominal target that was never achieved. With one fixed gain the assembly
# and its slice now track each other to a few tenths of a dB, which is what
# makes aiming at a slice level possible at all.
DRONE_LUFS = -25.2
SHIMMER_LUFS = -25.85

LICENSE = ("Generated locally with Meta audiocraft MusicGen-medium. Weights "
           "are CC-BY-NC 4.0 (research/non-commercial), released under the "
           "audiocraft license. Generated audio is original output; the "
           "sidecar records the exact prompt for reproducibility.")


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def measure(path):
    """(integrated LUFS, true peak dBTP) of `path`."""
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
             "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"])
    i = re.findall(r"I:\s+(-?\d+\.?\d*) LUFS", r.stderr)
    tp = re.findall(r"Peak:\s+(-?\d+\.?\d*) dBFS", r.stderr)
    if not i:
        sys.exit("could not measure:\n" + r.stderr[-2000:])
    return float(i[-1]), (float(tp[-1]) if tp else -99.0)


def stitch(out, stems, lufs):
    """Acrossfade `stems` end to end, then land the result on `lufs`."""
    out.parent.mkdir(parents=True, exist_ok=True)
    inputs = []
    parts = []
    for i, s in enumerate(stems):
        inputs += ["-i", str(s)]
        parts.append(f"[{i}:a]aformat=channel_layouts=mono,aresample={SR}[a{i}]")
    parts.append(f"[a0][a1]acrossfade=d={XFADE}:c1=tri:c2=tri[x1]")
    n = len(stems)
    for k in range(2, n):
        label = "joined" if k == n - 1 else f"x{k}"
        parts.append(f"[x{k - 1}][a{k}]acrossfade=d={XFADE}:c1=tri:c2=tri[{label}]")
    if n == 2:
        parts[-1] = parts[-1].replace("[x1]", "[joined]")
    parts.append("[joined]aformat=channel_layouts=stereo[out]")

    tmp = out.with_suffix(".tmp.wav")
    r = run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
             "-filter_complex", ";".join(parts), "-map", "[out]",
             "-ar", str(SR), "-c:a", "pcm_s24le", str(tmp)])
    if r.returncode:
        sys.exit(r.stderr[-3000:])

    m_i, m_tp = measure(tmp)
    gain = lufs - m_i
    # One gain for the whole file, but never into the true-peak ceiling.
    if m_tp + gain > TARGET_TP:
        gain = TARGET_TP - m_tp
    r = run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(tmp),
             "-af", f"volume={gain:.3f}dB", "-ar", str(SR),
             "-c:a", "pcm_s24le", str(out)])
    if r.returncode:
        sys.exit(r.stderr[-3000:])
    tmp.unlink()
    f_i, f_tp = measure(out)
    dur = float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(out)], text=True).strip())
    print(f"  {out.name}: {n} segments, {dur:.1f}s, "
          f"{m_i:.1f} -> {f_i:.1f} LUFS (gain {gain:+.2f} dB), peak {f_tp:.1f} dBTP")
    return dur, f_i, gain


def sidecar(out, stems_label, prompt_file, offset, dur, lufs, gain, notes):
    prompt = ""
    if prompt_file.exists():
        for line in prompt_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("prompt:"):
                prompt = line
                break
    j = {
        "source": "audiocraft MusicGen-medium (locally generated)",
        "stems": stems_label,
        "license": LICENSE,
        "generatedAt": "2026-05-31",
        "rebuiltAt": "2026-09-15",
        "processing": {
            "stitch": f"{XFADE}s triangular acrossfades between 75s stems",
            "assembledSeconds": round(dur, 1),
            "loopOffsetSeconds": offset,
            "searchSlackSeconds": round(dur - offset - 6, 1),
            "slackRationale": (
                "tools/seamfit.py needs room to move the loop start past a "
                "swell; the original build left 5s for the shimmer and it "
                "shipped a 19 dB step at the wrap"),
            "levelling": f"single measured gain of {gain:+.2f} dB to {lufs} LUFS",
            "levellingRationale": (
                "not loudnorm: in one pass it runs dynamic mode, which gates "
                "and pumps on long quiet material and can introduce the very "
                "level steps it is being asked to remove"),
            "sampleRate": SR,
        },
        "notes": notes,
        "promptHint": prompt,
    }
    with open(out.with_suffix(".json"), "w", encoding="utf-8") as f:
        json.dump(j, f, indent=2)
        f.write("\n")


def main():
    if not RAW.exists():
        sys.exit(f"stems not found: {RAW}")
    D = [RAW / f"bowl-drone-{i}.wav" for i in (1, 2, 3)]
    S = [RAW / f"bowl-shimmer-{i}.wav" for i in (1, 2)]
    for f in D + S:
        if not f.exists():
            sys.exit(f"missing stem: {f}")

    print("=== bowl-drone (251 s loop, 7-segment stitches) ===")
    # Each variant starts on a different stem so variantRotation 'random'
    # opens on a materially different timbre, as before. Seven segments
    # rather than five: 435 s, so the loop start can move 178 s.
    for v, order in enumerate([(0, 1, 2, 0, 1, 2, 0),
                               (1, 2, 0, 1, 2, 0, 1),
                               (2, 0, 1, 2, 0, 1, 2)], start=1):
        out = OUT / "bowl-drone" / f"drone-{v}.wav"
        dur, lufs, gain = stitch(out, [D[i] for i in order], DRONE_LUFS)
        label = "+".join(str(i + 1) for i in order) + " (75s stems)"
        sidecar(out, label, RAW / f"bowl-drone-{order[0] + 1}.prompt.txt",
                251, dur, DRONE_LUFS, gain,
                f"Seven 75s MusicGen-medium drone stems acrossfaded into a "
                f"{dur:.0f}s bed, cycle starting on drone-{order[0] + 1}. "
                f"Rebuilt 2026-09-15 to give the loop-start search room to "
                f"work; the five-segment original left too little and shipped "
                f"a stepped wrap.")

    print("=== bowl-shimmer (409 s loop, 9-segment stitches) ===")
    # Only two shimmer stems exist, so these alternate. Nine segments: 555 s,
    # so the loop start can move 140 s.
    for v, first in enumerate((0, 1), start=1):
        order = [(first + k) % 2 for k in range(9)]
        out = OUT / "bowl-shimmer" / f"shimmer-{v}.wav"
        dur, lufs, gain = stitch(out, [S[i] for i in order], SHIMMER_LUFS)
        label = "+".join(str(i + 1) for i in order) + " (75s stems)"
        sidecar(out, label, RAW / f"bowl-shimmer-{first + 1}.prompt.txt",
                409, dur, SHIMMER_LUFS, gain,
                f"Nine-segment alternation of the two MusicGen shimmer stems "
                f"into a {dur:.0f}s bed, starting on shimmer-{first + 1}. "
                f"Quieter than the drone (-25 vs -23 LUFS) so it sits under "
                f"the primary. Rebuilt 2026-09-15: the seven-segment original "
                f"was trimmed to 420s for a 409s loop, leaving a 5-second "
                f"search window and a 19 dB step at the wrap.")

    print("\nNow run: python tools/loopify-scenes.py")


if __name__ == "__main__":
    main()
