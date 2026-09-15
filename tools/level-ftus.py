#!/usr/bin/env python3
"""level-ftus.py -- level an FTUS multichannel master into a stereo scene source.

Records the recipe used for the 2026-08-18 FTUS batch (it lived only in a
scratch script until now). Per master:

  downmix to stereo     (--layout; see below -- never a generic -ac 2, which
                         folds rear/height capsules in and mushes the image)
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

--layout: FTUS names the channel layout in the filename prefix, before the
first underscore -- `TRNInt-L,R_...` is plain stereo, `TRNInt-M,S,Cs_...` is
mid/side, `TRNInt-W,Y,Z,X_...` is first-order ambisonic B-format in AmbiX
(ACN) order. Feeding a B-format file through `front-pair` would put the omni
W in the left channel and the left-right figure-8 Y in the right, which is
not a stereo signal at all. So:

  front-pair  (default) first two channels as L/R -- ORTF-3D masters, where
              c0/c1 are the front pair.
  ms          M/S: L = M + S, R = M - S. Exact, no choices to make.
  ambix       B-format: L = W + kY, R = W - kY, k from --width. The mono sum
              is 2W, so it collapses to the omni capsule -- ideal phone-
              speaker behaviour. k=0.7 was validated against FTUS's own M/S
              capture of the same Thailand sleeper cabin: ten octave bands
              agree within 2.0 dB RMS.

--balance: correct a standing L/R level difference. A field recording of a
train cabin is genuinely louder on the window side -- the B-format decode and
FTUS's own stereo capture of that cabin both measure about +4.6 dB -- and for
a scene played for eight hours that means one ear is consistently hotter all
night. Half the measured difference is applied to each channel, folded into
the downmix coefficients so it costs no extra pass. The image is untouched;
only the two channels' standing levels move.
"""
import argparse, datetime, json, os, re, subprocess, sys

DAN = "dynaudnorm=f=400:g=101:r=0.5:p=0.9:m=8"
FRONT = "pan=stereo|c0=c0|c1=c1"
SR = 48000


def downmix(layout, width, gl=1.0, gr=1.0):
    """The pan filter that turns a master into stereo, with the optional
    channel-balance gains folded straight into its coefficients.

    ffmpeg's `pan` takes a plain sum of `gain*channel` terms per output -- no
    parentheses, no nesting -- so the balance gain is multiplied into every
    coefficient rather than wrapped around the expression.
    """
    if layout == "front-pair":
        left = [(1.0, "c0")]
        right = [(1.0, "c1")]
    elif layout == "ms":
        left = [(0.5, "c0"), (0.5, "c1")]
        right = [(0.5, "c0"), (-0.5, "c1")]
    elif layout == "ambix":
        # AmbiX/ACN order is W, Y, Z, X -- so c1 is Y, the left-right
        # figure-8. Z and X (up-down, front-back) are deliberately unused:
        # there is no height or depth in a stereo bed to put them in.
        left = [(0.5, "c0"), (width / 2, "c1")]
        right = [(0.5, "c0"), (-width / 2, "c1")]
    else:
        raise SystemExit(f"unknown --layout {layout}")

    def terms(pairs, g):
        out = ""
        for coeff, ch in pairs:
            v = coeff * g
            out += f"{v:+.6f}*{ch}"
        return out.lstrip("+")

    return f"pan=stereo|c0={terms(left, gl)}|c1={terms(right, gr)}"


def channel_balance_db(src, pan):
    """Measured L-R RMS difference, in dB, of `src` downmixed through `pan`."""
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", src,
             "-af", f"{pan},astats=metadata=1:reset=0", "-f", "null", "-"])
    rms = [float(m) for m in
           re.findall(r"RMS level dB: (-?\d+\.?\d*)", r.stderr)]
    # astats prints per-channel entries then an Overall block; the first two
    # are L and R.
    if len(rms) < 2:
        sys.exit("could not measure channel balance:\n" + r.stderr[-2000:])
    return rms[0] - rms[1]


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def measure(src, target, tp, lra, pan=FRONT):
    """Pass 1: downmix + dynaudnorm, loudnorm in measurement mode."""
    fc = f"{pan},{DAN},loudnorm=I={target}:TP={tp}:LRA={lra}:print_format=json"
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-af", fc,
             "-ar", str(SR), "-f", "null", "-"])
    txt = r.stderr
    i = txt.rfind("{")
    j = txt.rfind("}")
    if i < 0 or j < 0:
        sys.exit("pass-1 loudnorm JSON not found:\n" + txt[-2000:])
    return json.loads(txt[i:j + 1])


def render(src, out, m, target, tp, lra, pan=FRONT):
    """Pass 2: same chain, loudnorm in linear mode with pass-1 measurements."""
    ln = (f"loudnorm=I={target}:TP={tp}:LRA={lra}:linear=true"
          f":measured_I={m['input_i']}:measured_TP={m['input_tp']}"
          f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
          f":offset={m['target_offset']}:print_format=json")
    fc = f"{pan},{DAN},{ln}"
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
    ap.add_argument("--layout", default="front-pair",
                    choices=["front-pair", "ms", "ambix"],
                    help="channel layout of the master; FTUS encodes it in "
                         "the filename prefix (L,R / M,S,Cs / W,Y,Z,X)")
    ap.add_argument("--width", type=float, default=0.7,
                    help="ambix only: weight on the Y figure-8 (0 = mono W)")
    ap.add_argument("--balance", action="store_true",
                    help="correct a standing L/R level difference")
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    stem = a.dest.replace("/", "__")
    out = os.path.join(a.outdir, stem + ".wav")
    pan = downmix(a.layout, a.width)
    bal = 0.0
    if a.balance:
        bal = channel_balance_db(a.master, pan)
        # Half the difference off the loud side, half onto the quiet one, so
        # the correction is symmetric and the summed level barely moves.
        gl, gr = 10 ** (-bal / 40), 10 ** (bal / 40)
        pan = downmix(a.layout, a.width, gl, gr)
        print(f"  balance {stem}: L-R {bal:+.2f} dB measured -> "
              f"{-bal / 2:+.2f}/{bal / 2:+.2f} dB applied")
    m = measure(a.master, a.target, a.tp, a.lra, pan)
    print(f"  pass1 {stem}: I={m['input_i']} LRA={m['input_lra']} TP={m['input_tp']}")
    o = render(a.master, out, m, a.target, a.tp, a.lra, pan)
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
            "channelLayout": a.layout,
            "downmix": pan,
            "downmixRationale": {
                "front-pair": "front ORTF L/R of the ORTF 3D master",
                "ms": "mid/side decode: L = M + S, R = M - S",
                "ambix": (f"first-order B-format (AmbiX/ACN: W, Y, Z, X) "
                          f"decoded to stereo as L = W + {a.width}Y, "
                          f"R = W - {a.width}Y; the mono sum is 2W, the omni "
                          f"capsule. Z and X unused - no height or depth to "
                          f"put them in."),
            }[a.layout],
            "channelBalanceDb": round(bal, 2) if a.balance else None,
            "channelBalanceRationale": (
                "measured standing L/R difference, halved onto each channel: "
                "the cabin really is louder on one side, but a bed played for "
                "eight hours should not leave one ear hotter all night"
            ) if a.balance else None,
            "leveling": DAN,
            "loudnorm": f"two-pass linear, I={float(o['output_i']):.2f} LUFS, TP={a.tp} dBTP, LRA={a.lra}",
            "lengthSeconds": round(float(dur), 1),
            "sampleRate": SR,
            "bitDepth": 24,
        },
        "notes": f"Downmixed ({a.layout}) and levelled by tools/level-ftus.py.",
    }
    with open(os.path.join(a.outdir, stem + ".json"), "w", encoding="utf-8") as f:
        json.dump(side, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
