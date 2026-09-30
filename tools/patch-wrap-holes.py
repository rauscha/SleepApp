#!/usr/bin/env python3
"""Repair the hole at the loop wrap of an already-cut scene variant, in place.

Why this exists (DECISIONS.md, "The wrap was a hole", 2026-09-30): until
then `loopify-scenes.py` never mixed the crossfade tail into the wrap, so
most shipped loops end at full level and wrap into a fade-up from near
silence. A shipped file is exactly P seconds long, so it has no audio past
the loop point to rebuild a real crossfade from. Re-cutting from source is
the other option, but half the sources are not on this box, and it would
undo the tonal (bird) repairs made to the shipped files.

Method. The file is a circle of length P. The damaged arc runs from the
last C seconds of the file, through the wrap, to C seconds past the end of
the hole at h:

    [P-c1, P) original tail  -> equal-power crossfade into donor
    [0, h)    donor
    [h, h+C)  donor          -> equal-power crossfade back into the original

c1 is C, or LONG_XFADE (20 s) when the tail and head are different
recordings (a composite) and no donor can match both ends: the change of
material is then as slow as the join inside the file.

The donor Q is one stretch of c1 + h + C seconds taken from the middle of the
same file. It is chosen to sit at the tail's level, to be steady, and to
carry as few narrow tonal events (birds, squeaks) as possible, since it is
heard twice per loop. Its two ends are matched in octave-band SPECTRUM to
the audio they crossfade against, not just in level. The fades are qsin (sin/cos), so the power of the two
uncorrelated signals sums flat. The sample count does not change, so the
file stays on its prime and `sceneCatalogue.test.ts` still holds.

h is where the head first climbs back within HOLE_RECOVERY_DB of the tail
level, plus a second of margin, and never less than C. That floor matters:
the old wrap's fade-in ran across all of [0, C), so anything short of C
would keep part of it.

Cost: one more generation of Opus 128k across the file. That is the same
trade the 2026-09-14 bird repair made, and it is inaudible on these beds.

Usage:
    python tools/patch-wrap-holes.py                # every holed variant
    python tools/patch-wrap-holes.py --dry-run      # measure, write nothing
    python tools/patch-wrap-holes.py public/audio/x/y/z.opus ...
"""

import argparse
import datetime
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
C = 6.0                  # matches loopify-scenes.py
FRAME = 0.25             # envelope resolution, seconds
HOLE_DB = 6.0            # matches AUDIT_HOLE_DB in loopify-scenes.py
HOLE_RECOVERY_DB = 1.5
SPARSE_TAIL_DB = -60.0   # a sparse event layer is silent at its wrap by design
EDGE_GUARD = 20.0        # keep the donor this far from both ends
BITRATE = "128k"


def decode(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le",
                        "-ac", "2", "-ar", str(SR), "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2).copy()


def envelope(x):
    n = int(SR * FRAME)
    k = len(x) // n
    m = x[:k * n].mean(axis=1).reshape(k, n)
    return 10 * np.log10((m ** 2).mean(axis=1) + 1e-12)


def tonality(x):
    """Per-frame narrowband prominence, 300 Hz-9 kHz: peak bin over the
    band's median, in dB. High values are birds, squeaks, whistles."""
    n = int(SR * FRAME)
    k = len(x) // n
    m = x[:k * n].mean(axis=1).reshape(k, n) * np.hanning(n)
    spec = np.abs(np.fft.rfft(m, axis=1))
    f = np.fft.rfftfreq(n, 1 / SR)
    band = (f > 300) & (f < 9000)
    s = 20 * np.log10(spec[:, band] + 1e-9)
    return s.max(axis=1) - np.median(s, axis=1)


def measure(x):
    """(tail_db, hole_db, hole_end_seconds, natural_p95_db) for a loop in `x`."""
    env = envelope(x)
    nc = int(C / FRAME)
    tail = float(env[-nc:].mean())
    hole = tail - float(env[:nc].min())
    head = env[:int(12 / FRAME)]
    ok = np.where(head >= tail - HOLE_RECOVERY_DB)[0]
    end = ok[0] * FRAME if len(ok) else 12.0
    return tail, hole, end, natural_dip_p95(env)


def natural_dip_p95(env):
    """The same statistic as the hole -- level of the C seconds before a
    point minus the quietest frame in the C seconds after it -- taken at
    every second of the file away from the wrap. Its 95th percentile is how
    deep this material dips on its own: an ocean trough, a lull in the wind.
    A wrap is only a hole if it dips well past that."""
    nc = int(C / FRAME)
    step = int(1 / FRAME)
    vals = [float(env[i - nc:i].mean() - env[i:i + nc].min())
            for i in range(2 * nc, len(env) - 2 * nc, step)]
    return float(np.percentile(vals, 95)) if vals else 0.0


OCTAVES = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]


def octave_frames(x):
    """Per-second octave-band power, shape (seconds, bands)."""
    m = x.mean(axis=1)
    k = len(m) // SR
    spec = np.abs(np.fft.rfft(m[:k * SR].reshape(k, SR), axis=1)) ** 2
    f = np.fft.rfftfreq(SR, 1 / SR)
    cols = []
    for c in OCTAVES:
        sel = (f >= c / np.sqrt(2)) & (f < c * np.sqrt(2))
        cols.append(spec[:, sel].sum(axis=1))
    return np.stack(cols, axis=1)


def band_db(frames, a, b):
    return 10 * np.log10(frames[int(a):int(b)].mean(axis=0) + 1e-20)


LONG_XFADE = 20.0        # for a loop whose two ends are different recordings
LONG_XFADE_OVER_DB = 6.0 # octave mismatch that means "different recordings"


def choose_donor(x, period, h, c1):
    """The donor's two ends are crossfaded against the file: its first c1
    seconds against the tail, its last C against the head just past the
    hole. So it is chosen to match both in SPECTRUM, not just level. A
    level-only choice picked a thin stretch of a two-recording composite
    and cut everything under 600 Hz from each wrap (seam review,
    2026-09-30). A longer first crossfade tolerates more mismatch at the
    start, in proportion. Returns (start_s, octave_mismatch_db)."""
    need = c1 + h + C
    ob = octave_frames(x)
    tail_ref = band_db(ob, period - 2 * C, period)
    head_ref = band_db(ob, h, h + 2 * C)
    # Bands carrying real energy; the rest are noise floor.
    both = np.maximum(tail_ref, head_ref)
    active = both > both.max() - 30
    env = envelope(x)
    tail_db = float(env[-int(C / FRAME):].mean())
    ton = tonality(x)
    tonal = ton > (np.median(ton) + 12)
    # Dilate by a second each way: a donor must not clip the edge of a call.
    pad = int(1 / FRAME)
    near_tonal = np.convolve(tonal.astype(float), np.ones(2 * pad + 1), "same") > 0
    w = int(round(need / FRAME))
    best = None
    for s in range(int(EDGE_GUARD), int(period - EDGE_GUARD - need)):
        start_db = band_db(ob, s, s + 2 * C)
        end_db = band_db(ob, s + need - 2 * C, s + need)
        start_miss = float(np.abs(start_db - tail_ref)[active].mean())
        end_miss = float(np.abs(end_db - head_ref)[active].mean())
        i = int(s / FRAME)
        seg = env[i:i + w]
        # A lull inside the donor is a new hole.
        lull = max(0.0, tail_db - float(seg.min()) - 6.0)
        score = (start_miss * (C / c1) + end_miss + float(seg.std()) + lull
                 # Any call inside the donor would be heard twice per loop;
                 # that costs more than any mismatch can.
                 + 100.0 * float(near_tonal[i:i + w].mean()))
        if best is None or score < best[0]:
            best = (score, float(s), start_miss + end_miss)
    return best[1], best[2]


def patch(x, period, hole_end, tail_db):
    n = len(x)
    h = max(C, hole_end + 1.0)
    c1 = C
    donor, spectral = choose_donor(x, period, h, c1)
    if spectral > LONG_XFADE_OVER_DB:
        # The loop's two ends are different material (a composite of two
        # recordings). No donor can match both, so make the change as slow
        # as the join inside the file rather than a 6 s lurch.
        c1 = LONG_XFADE
        donor, spectral = choose_donor(x, period, h, c1)
    n1, nc, nh, q0 = int(c1 * SR), int(C * SR), int(h * SR), int(donor * SR)
    q = x[q0:q0 + n1 + nh + nc]

    def fades(k):
        t = (np.arange(k) / k)[:, None]
        return np.sin(t * np.pi / 2), np.cos(t * np.pi / 2)

    fin1, fout1 = fades(n1)
    fin, fout = fades(nc)
    y = x.copy()
    y[n - n1:] = x[n - n1:] * fout1 + q[:n1] * fin1
    y[:nh] = q[n1:n1 + nh]
    y[nh:nh + nc] = q[n1 + nh:n1 + nh + nc] * fout + x[nh:nh + nc] * fin
    return y, h, c1, donor, spectral


def encode(y, out):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ac", "2",
                    "-ar", str(SR), "-i", "-", "-c:a", "libopus",
                    "-b:a", BITRATE, out],
                   input=y.astype(np.float32).tobytes(), check=True)


def scene_variants():
    """{path: period} for every variant of every shipped scene."""
    import glob
    out = {}
    for sj in sorted(glob.glob(os.path.join(ROOT, "public", "scenes", "*.json"))):
        if sj.endswith("index.json"):
            continue
        s = json.load(open(sj, encoding="utf-8"))
        for el in s.get("elements", []):
            for v in el["variants"]:
                url = v if isinstance(v, str) else v["url"]
                out[os.path.join(ROOT, "public", url.lstrip("/"))] = el["loopOffsetSeconds"]
    return out


def record(path, fields):
    sc = os.path.splitext(path)[0] + ".json"
    side = json.load(open(sc, encoding="utf-8")) if os.path.exists(sc) else {}
    side.setdefault("processing", {})["wrapPatch"] = fields
    with open(sc, "w", encoding="utf-8") as f:
        json.dump(side, f, indent=2)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="patch the named files even without a hole: a wrap "
                         "cut past C seconds is a hard splice with no "
                         "crossfade at all, and tools/seam-review.py can show "
                         "it stepping in spectrum")
    args = ap.parse_args()

    catalogue = scene_variants()
    targets = ([os.path.abspath(p) for p in args.paths] if args.paths
               else sorted(catalogue))
    today = datetime.date.today().isoformat()
    for path in targets:
        rel = os.path.relpath(path, ROOT)
        period = catalogue.get(path)
        if period is None:
            print(f"  ?     {rel}: not in any scene, skipped")
            continue
        x = decode(path)
        tail, hole, end, natural = measure(x)
        if tail < SPARSE_TAIL_DB:
            print(f"  -     {rel}: sparse layer (tail {tail:.0f} dB), no wrap to patch")
            continue
        # A hole is a dip past HOLE_DB AND well past what the material does
        # on its own (waves trough 6-10 dB every few seconds).
        if hole <= max(HOLE_DB, natural + 3.0) and not (args.force and args.paths):
            print(f"  ok    {rel}: hole {hole:.1f} dB (natural p95 {natural:.1f})")
            continue
        y, h, c1, donor, spectral = patch(x, period, end, tail)
        after = measure(y)[1]
        print(f"  patch {rel}: hole {hole:.1f} -> {after:.1f} dB "
              f"(natural p95 {natural:.1f}), arc {c1 + h + C:.1f}s"
              f"{' (20 s crossfade in)' if c1 > C else ''}, "
              f"donor at {donor:.1f}s (octave mismatch {spectral:.1f} dB)"
              + ("  (dry run)" if args.dry_run else ""))
        if args.dry_run:
            continue
        tmp = path + ".tmp.opus"
        encode(y, tmp)
        got = decode(tmp)
        if abs(len(got) - len(x)) > SR // 100:
            os.remove(tmp)
            sys.exit(f"  FAIL  {rel}: length changed {len(x)} -> {len(got)} samples")
        final_hole = measure(got)[1]
        os.replace(tmp, path)
        record(path, {
            "date": today,
            "tool": "tools/patch-wrap-holes.py",
            "holeBeforeDb": round(hole, 1),
            "holeAfterDb": round(final_hole, 1),
            "naturalDipP95Db": round(natural, 1),
            "patchedArcSeconds": round(c1 + h + C, 2),
            "crossfadeInSeconds": c1,
            "donorStartSeconds": round(donor, 2),
            "donorOctaveMismatchDb": round(spectral, 2),
            "why": ("loopify-scenes.py never mixed the wrap crossfade tail in "
                    "(afade ran before asetpts), so the loop wrapped into a "
                    "fade-up from near silence every P seconds. Repaired in "
                    "place: the arc around the wrap is replaced by a "
                    "spectrum-matched stretch of this file with equal-power "
                    "crossfades; sample count unchanged. DECISIONS.md, 'The "
                    "wrap was a hole'."),
        })


if __name__ == "__main__":
    main()
