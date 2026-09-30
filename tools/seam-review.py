#!/usr/bin/env python3
"""Hear every loop wrap the way a sleeper does: in the mix.

For each scene, each element, each variant: render the scene around that
variant's loop wrap. The variant plays through its wrap while every other
element (its first variant) and the synth bed run steadily at their voiced
default levels, parked well away from their own wraps. Then compare the
spectrum in six-second windows across the seam:

    pre   [-18, -12]  clean original
    A     [-12,  -6]  clean original
    B     [ -6,   0]  the last C seconds: the incoming crossfade
    D     [  0,   6]  just past the wrap
    E     [  6,  12]  the outgoing crossfade of a patched wrap
    post  [ 12,  18]  clean again

Each window is reduced to third-octave band levels, 40 Hz-16 kHz. The seam
score is the largest band difference of B/D/E (what the wrap can touch)
against the power mean of pre, A and post (the clean material around it). A score
means nothing without knowing how much this material differs from ITSELF
over the same span, so the same geometry is measured at BASELINE_POINTS
random positions away from the wrap, and a seam is flagged only when it
beats the file's own 95th percentile by FLAG_MARGIN_DB. Both the variant
alone (diagnostic) and the full mix (what is heard) are scored.

A splice can also click without changing the spectrum, so the energy above
6 kHz in 5 ms frames across [-0.1, +0.1] s is compared against the file's
own frame-to-frame jumps.

Writes a report to stdout and, with --render, the mix clips plus a
spectrogram scrubber per scene under notes/seam-review/ (gitignored).

    python tools/seam-review.py                 # score every seam
    python tools/seam-review.py monsoon --render
"""

import argparse
import glob
import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "notes", "seam-review")
SR = 48000
BEFORE, AFTER = 18.0, 18.0          # clip spans [-18, +18] around the wrap
WIN = 6.0
WINDOWS = {"A": -12.0, "B": -6.0, "D": 0.0, "E": 6.0, "post": 12.0}
REF = -18.0
BASELINE_POINTS = 40
FLAG_MARGIN_DB = 1.0
SPARSE_DB = -60.0
RNG = np.random.default_rng(20260930)

# Third-octave centres, 40 Hz-16 kHz.
CENTRES = [40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
           1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
           12500, 16000]


def decode(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le",
                        "-ac", "1", "-ar", str(SR), "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32)


def circular(x, start_s, dur_s):
    """dur_s seconds of loop `x` starting at start_s, wrapping as a native
    loop does."""
    n = len(x)
    i0 = int(round(start_s * SR)) % n
    idx = (np.arange(int(dur_s * SR)) + i0) % n
    return x[idx]


def bands(seg):
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
    f = np.fft.rfftfreq(len(seg), 1 / SR)
    out = []
    for c in CENTRES:
        lo, hi = c / 2 ** (1 / 6), c * 2 ** (1 / 6)
        m = (f >= lo) & (f < hi)
        out.append(10 * np.log10(spec[m].sum() + 1e-20))
    return np.array(out)


def seam_score(clip, active):
    """Largest third-octave difference of any window the wrap can touch
    (B, D, E) against the clean material on both sides of it (the mean of
    pre, A and post). Scoring only the touched windows keeps an event in
    untouched audio from reading as a seam. `clip` starts at -BEFORE."""
    def at(t):
        i = int((t + BEFORE) * SR)
        return bands(clip[i:i + int(WIN * SR)])
    ref = 10 * np.log10(np.mean([10 ** (at(t) / 10)
                                 for t in (REF, WINDOWS["A"], WINDOWS["post"])], axis=0))
    worst, where = 0.0, None
    for name in ("B", "D", "E"):
        d = np.abs(at(WINDOWS[name]) - ref)[active]
        k = int(np.argmax(d))
        if d[k] > worst:
            worst, where = float(d[k]), (name, CENTRES[np.flatnonzero(active)[k]])
    return worst, where


def active_bands(x):
    """Bands within 30 dB of the loudest: below that a band is noise floor
    and its ratios are meaningless."""
    b = bands(x[:min(len(x), 60 * SR)])
    return b > (b.max() - 30)


def click_ratio(x):
    """Largest 5 ms jump in high-passed energy within 0.1 s of the wrap,
    against the 95th percentile of the same 0.2 s maximum taken all through
    the file (a crackling fire is full of clicks; only an unusual one at the
    wrap counts). The loop is rolled so the wrap (last sample -> first)
    sits mid-array and the difference across it is actually computed."""
    n = int(0.005 * SR)
    y = np.roll(x, len(x) // 2)
    hp = np.diff(y)                        # crude high-pass: emphasises clicks
    k = len(hp) // n
    e = 10 * np.log10((hp[:k * n].reshape(k, n) ** 2).mean(axis=1) + 1e-20)
    jumps = np.abs(np.diff(e))
    w = 40
    i = (len(x) // 2) // n
    near = jumps[i - w // 2:i + w // 2].max()
    starts = RNG.integers(0, len(jumps) - w, 400)
    typical = np.percentile([jumps[s:s + w].max() for s in starts], 95)
    return float(near - typical)


def scenes(only):
    for sj in sorted(glob.glob(os.path.join(ROOT, "public", "scenes", "*.json"))):
        if sj.endswith("index.json"):
            continue
        s = json.load(open(sj, encoding="utf-8"))
        if only and s["id"] not in only:
            continue
        yield s


def path_of(url):
    return os.path.join(ROOT, "public", url.lstrip("/"))


def review_scene(s, render):
    cache = {}

    def load(p):
        if p not in cache:
            cache[p] = decode(p)
        return cache[p]

    els = s.get("elements", [])
    bed = None
    if s.get("synth"):
        bed = (path_of(f"/audio/_bed/{s['synth']['color']}.opus"),
               s["synth"]["defaultVolume"], 887)
    rows, clips = [], []
    for ei, el in enumerate(els):
        P = el["loopOffsetSeconds"]
        for v in el["variants"]:
            url = v if isinstance(v, str) else v["url"]
            vp = path_of(url)
            x = load(vp)
            span = BEFORE + AFTER
            solo = circular(x, len(x) / SR - BEFORE, span)
            tail = x[-int(WIN * SR):]
            if 10 * np.log10((tail ** 2).mean() + 1e-20) < SPARSE_DB:
                continue    # a sparse layer is silent at its wrap by design
            # The rest of the scene, steady and away from its own wraps.
            mix = solo * el["defaultVolume"]
            for oj, other in enumerate(els):
                if oj == ei:
                    continue
                ov = other["variants"][0]
                op = path_of(ov if isinstance(ov, str) else ov["url"])
                ox = load(op)
                park = 40.0 + 23.0 * oj   # far from 0 and from P, distinct per layer
                mix = mix + circular(ox, park, span) * other["defaultVolume"]
            if bed:
                mix = mix + circular(load(bed[0]), 300.0, span) * bed[1]

            act = active_bands(x)
            s_solo, w_solo = seam_score(solo, act)
            s_mix, w_mix = seam_score(mix, active_bands(mix))
            # The file against itself: same geometry at random points.
            base_solo, base_mix = [], []
            for t0 in RNG.uniform(60, max(61, P - 60), BASELINE_POINTS):
                seg = circular(x, t0 - BEFORE, span)
                base_solo.append(seam_score(seg, act)[0])
                segm = mix - solo * el["defaultVolume"] + seg * el["defaultVolume"]
                base_mix.append(seam_score(segm, active_bands(segm))[0])
            p_solo = float(np.percentile(base_solo, 95))
            p_mix = float(np.percentile(base_mix, 95))
            clk = click_ratio(x)
            flag = []
            if s_solo > p_solo + FLAG_MARGIN_DB:
                flag.append("SPECTRUM")
            if s_mix > p_mix + FLAG_MARGIN_DB:
                flag.append("MIX")
            if clk > 6.0:
                flag.append("CLICK")
            rows.append({
                "scene": s["id"], "element": el["id"],
                "variant": os.path.basename(vp),
                "soloDb": s_solo, "soloP95": p_solo, "soloWhere": w_solo,
                "mixDb": s_mix, "mixP95": p_mix, "mixWhere": w_mix,
                "clickDb": clk, "flags": flag,
            })
            if render:
                os.makedirs(os.path.join(OUT, s["id"]), exist_ok=True)
                name = f"{el['id']}__{os.path.splitext(os.path.basename(vp))[0]}.wav"
                wav = os.path.join(OUT, s["id"], name)
                peak = max(1e-9, float(np.abs(mix).max()))
                pcm = (mix / peak * 0.5).astype(np.float32)   # level for listening
                subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le",
                                "-ac", "1", "-ar", str(SR), "-i", "-", wav],
                               input=pcm.tobytes(), check=True)
                clips.append(wav)
    return rows, clips


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scenes", nargs="*")
    ap.add_argument("--render", action="store_true",
                    help="write mix clips and a scrubber page per scene")
    ap.add_argument("--json", help="also write the rows here")
    args = ap.parse_args()

    all_rows = []
    for s in scenes(set(args.scenes)):
        rows, clips = review_scene(s, args.render)
        all_rows += rows
        if args.render and clips:
            scope = os.path.expanduser("~/.claude/skills/audio-scope/audio-scope.mjs")
            if os.path.exists(scope):
                subprocess.run(["node", scope, "--out", os.path.join(OUT, s["id"], "scope"),
                                "--fmax", "16000", "--height", "300",
                                "--mark", f"{BEFORE}=wrap"] + clips,
                               check=False, capture_output=True)
    print(f"{'scene':<16} {'element':<22} {'variant':<16} "
          f"{'solo':>6} {'p95':>5} {'mix':>6} {'p95':>5} {'click':>6}  worst band      flags")
    for r in all_rows:
        wb = r["soloWhere"]
        where = f"{wb[0]}@{wb[1]}Hz" if wb else ""
        print(f"{r['scene']:<16} {r['element']:<22} {r['variant']:<16} "
              f"{r['soloDb']:>6.1f} {r['soloP95']:>5.1f} {r['mixDb']:>6.1f} "
              f"{r['mixP95']:>5.1f} {r['clickDb']:>+6.1f}  {where:<15} {' '.join(r['flags'])}")
    flagged = [r for r in all_rows if r["flags"]]
    print(f"\n{len(flagged)} of {len(all_rows)} seams flagged "
          f"(beyond the file's own p95 + {FLAG_MARGIN_DB} dB, or a click).")
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(all_rows, f, indent=2, default=str)


if __name__ == "__main__":
    main()
