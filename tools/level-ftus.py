#!/usr/bin/env python3
"""level-ftus.py -- level an FTUS ORTF-3D master into a stereo scene source.

Records the recipe used for the 2026-08-18 FTUS batch (it lived only in a
scratch script until now). Per master:

  front ORTF pair only  (pan=stereo|c0=c0|c1=c1 -- never a generic -ac 2,
                         which folds rear/height capsules in and mushes the
                         stereo image)
  -> dynaudnorm         (~40 s window: slow-drift levelling that does not
                         pump on transients)
  -> two-pass loudnorm  (LINEAR mode with measured_* from pass 1; single-pass
                         loudnorm runs dynamic mode, which gates and pumps on
                         a long noise bed)
  -> 48 kHz / 24-bit stereo WAV + sidecar JSON, ready for
     tools/loopify-scenes.py to seam-search and trim to its prime offset.

Usage:
  python tools/level-ftus.py --rec-id 800 --target -20.5 \
      --dest waterfall-valley/creek-below/creek-1 \
      "D:/Sounds/picked/<master>.wav" "D:/Sounds/normalized"

Target LUFS: match the destination ELEMENT's measured median (the catalogue
was never uniformly normalised; a global target would wreck the mix voicing).
"""
import argparse, json, os, subprocess, sys, datetime

DAN = "dynaudnorm=f=400:g=101:r=0.5:p=0.9:m=8"
FRONT = "pan=stereo|c0=c0|c1=c1"
SR = 48000


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def measure(src, target, tp, lra):
    """Pass 1: front pair + dynaudnorm, loudnorm in measurement mode."""
    fc = f"{FRONT},{DAN},loudnorm=I={target}:TP={tp}:LRA={lra}:print_format=json"
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-af", fc,
             "-ar", str(SR), "-f", "null", "-"])
    txt = r.stderr
    i = txt.rfind("{")
    j = txt.rfind("}")
    if i < 0 or j < 0:
        sys.exit("pass-1 loudnorm JSON not found:\n" + txt[-2000:])
    return json.loads(txt[i:j + 1])


def render(src, out, m, target, tp, lra):
    """Pass 2: same chain, loudnorm in linear mode with pass-1 measurements."""
    ln = (f"loudnorm=I={target}:TP={tp}:LRA={lra}:linear=true"
          f":measured_I={m['input_i']}:measured_TP={m['input_tp']}"
          f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
          f":offset={m['target_offset']}:print_format=json")
    fc = f"{FRONT},{DAN},{ln}"
    r = run(["ffmpeg", "-y", "-hide_banner", "-nostats", "-i", src, "-af", fc,
             "-ar", str(SR), "-c:a", "pcm_s24le", out])
    if r.returncode:
        sys.exit(r.stderr[-2000:])
    txt = r.stderr
    return json.loads(txt[txt.rfind("{"):txt.rfind("}") + 1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("master")
    ap.add_argument("outdir")
    ap.add_argument("--dest", required=True, help="scene/element/variant")
    ap.add_argument("--target", type=float, required=True, help="integrated LUFS")
    ap.add_argument("--rec-id", default="")
    ap.add_argument("--tp", type=float, default=-1.0)
    ap.add_argument("--lra", type=float, default=11)
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    stem = a.dest.replace("/", "__")
    out = os.path.join(a.outdir, stem + ".wav")
    m = measure(a.master, a.target, a.tp, a.lra)
    print(f"  pass1 {stem}: I={m['input_i']} LRA={m['input_lra']} TP={m['input_tp']}")
    o = render(a.master, out, m, a.target, a.tp, a.lra)
    print(f"  pass2 {stem}: I={o['output_i']} LRA={o['output_lra']} TP={o['output_tp']} -> {out}")
    dur = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
                                   "format=duration", "-of", "csv=p=0", out], text=True).strip()
    side = {
        "source": "Free To Use Sounds \u2014 All In One Immersive Bundle (purchased)",
        "recId": a.rec_id,
        "bundleFile": os.path.basename(a.master),
        "url": "https://www.freetousesounds.com/",
        "license": "Purchased FTUS bundle; (c) Free To Use Sounds LLC, all rights reserved. Personal build only \u2014 do not redistribute.",
        "downloadedAt": datetime.date.today().isoformat(),
        "destination": a.dest,
        "processing": {
            "frontPair": f"{FRONT} (front ORTF L/R of the 8ch ORTF 3D master)",
            "leveling": DAN,
            "loudnorm": f"two-pass linear, I={float(o['output_i']):.2f} LUFS, TP={a.tp} dBTP, LRA={a.lra}",
            "lengthSeconds": round(float(dur), 1),
            "sampleRate": SR,
            "bitDepth": 24,
        },
        "notes": "Front ORTF pair from 8ch ORTF 3D master, levelled by tools/level-ftus.py.",
    }
    json.dump(side, open(os.path.join(a.outdir, stem + ".json"), "w", encoding="utf-8"), indent=2)


if __name__ == "__main__":
    main()
