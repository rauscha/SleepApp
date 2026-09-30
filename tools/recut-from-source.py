#!/usr/bin/env python3
"""Re-cut shipped scene loops from their source recordings, same window.

Why (DECISIONS.md, "The wrap was a hole", 2026-09-30): until then
`loopify-scenes.py` never mixed the wrap crossfade's tail in, so most loops
wrapped into a fade-up from near silence. The fix belongs in the pipeline,
not in each file: this re-runs the cut from the source with the fixed tool.

**Same window, not a new one.** The audio in every shipped loop has been
lived with and vetted (bird scans, voice scans, Andrew's ear), so the re-cut
reproduces it. Rather than trusting half-remembered recipes, it FINDS where
the shipped loop sits in its source by cross-correlation: two 20 s probes
from the shipped file, one early and one late, must land on the same source
offset to within 5 ms, or the file is refused. The loop is then rebuilt from
[S, S+P+C] of the source with `seamless_loop()`, so the wrap is a real
equal-power crossfade into the C seconds that actually follow the loop in
the recording. A single constant gain matches the level of the shipped
file, measured over the aligned middle. Sample count is P.

A recipe's processing that already lives in its source (FTUS leveling, the
front-pair or B-format decode) is inherited from the leveled master. What
the recipe did on top (a distance low-pass, single-pass loudnorm) is re-run
from the same cut point, so the re-cut moves over time exactly as the
shipped file did: single-pass loudnorm rides the level, and on forest-2 it
had pulled an insect burst down 8 dB. Each re-cut must match its shipped
file in level contour (10 s windows) and in third-octave spectrum, or it is
refused.

Files that once had tonal (bird) repairs get the repair re-applied with
`repair-tonal-events.py`, since the re-cut starts from unrepaired source.

    python tools/recut-from-source.py --dry-run     # align and report only
    python tools/recut-from-source.py               # re-cut every target
    python tools/recut-from-source.py monsoon/rain/rain-2
"""

import argparse
import datetime
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "public", "audio")
SOUNDS = os.path.expanduser("~/sounds")
SR = 48000
LO = 4000            # alignment rate
C = 6.0
PROBE = 20.0
AGREE_S = 0.005
# The commit before any wrap patch touched the audio: the reference for
# what each loop sounds like.
REFERENCE_REV = "11507e7"

_spec = importlib.util.spec_from_file_location(
    "loopify", os.path.join(ROOT, "tools", "loopify-scenes.py"))
loopify = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(loopify)

YT = os.path.join(SOUNDS, "raw-sounds", "_sources")
NORM = os.path.join(SOUNDS, "normalized")
RAW = os.path.join(SOUNDS, "raw-sounds")
YOUTUBE = {
    "WyK-3LoOwJw": f"{YT}/fireplace/fireplace__fobos-planet-12h__WyK-3LoOwJw.opus",
    "i7ds-DhM89I": f"{YT}/george-vlad-ocean/ocean-night__sandy-beach-madagascar__i7ds-DhM89I.opus",
    "SNgELhR1v2k": f"{YT}/george-vlad-ocean/ocean-night__rocky-beach-masoala__SNgELhR1v2k.opus",
    "mM05RM0zBnY": f"{YT}/george-vlad/monsoon__rain-soft-japan-forest__mM05RM0zBnY.opus",
    "etNCIPGSWaA": f"{YT}/george-vlad/forest-day__rainy-morning-cloud-forest__etNCIPGSWaA.opus",
    "iH4zn2-FWxA": f"{YT}/george-vlad/wind-element__soft-wind-and-snow__iH4zn2-FWxA.opus",
    "kb-VSf-QdUU": f"{YT}/george-vlad/forest-day__morning-cloud-forest__kb-VSf-QdUU.opus",
    "0YiWnEW0PuA": f"{YT}/george-vlad/forest-day__dawn-chorus-cloud-forest__0YiWnEW0PuA.opus",
    "AUBrM-ws5Co": f"{YT}/george-vlad/monsoon__rain-delicate-rainforest__AUBrM-ws5Co.opus",
    "mB6ATIwmEAQ": f"{YT}/george-vlad/wind-element__namib-desert-wind__mB6ATIwmEAQ.opus",
    "6XyRbGwoPxk": f"{YT}/george-vlad/forest-day__dawn-chorus-by-lake__6XyRbGwoPxk.opus",
    "9BC4gUUoMXc": f"{YT}/george-vlad/forest-evening__wind-and-birdsong-japan__9BC4gUUoMXc.opus",
}


# Loops built from two recordings joined inside the file, from the sidecar
# recipe ("two forest-day creek MP3s, 460 s + 540 s ... 20 s triangular
# crossfade") and confirmed by alignment: (source, start s, length s) per
# part, joined by an XFADE-second acrossfade. The loop starts at 0.
BROOK = os.path.join(RAW, "freesound_community-small-brook-water-16811.mp3")
CREEK2 = os.path.join(RAW, "creek-2.mp3")
XFADE = 20.0
PAV2 = os.path.join(RAW, "rain-pavement-2.mp3")
COMPOSITES = {
    # "acrossfade-extended 525s->540s (acrossfade d=20 with a second copy,
    # re-loudnorm -23 LUFS)": the recording crossfaded into itself.
    "rain-on-window/rain-pavement/pavement-2.opus": [(PAV2, 5.0, 525.0, "pixabay"),
                                                     (PAV2, 5.0, 525.0, "pixabay")],
    "forest-evening/creek-trickle/creek-1.opus": [(BROOK, 5.0, 460.0, None), (CREEK2, 5.0, 540.0, None)],
    "forest-evening/creek-trickle/creek-2.opus": [(CREEK2, 5.0, 540.0, None), (BROOK, 5.0, 460.0, None)],
}


def build_composite(rel, period):
    """Rebuild a two-recording composite from its sources, level-matched per
    part to the shipped file, and return the first P+C+1 seconds (stereo).
    Refuses if either part does not sit where the recipe says."""
    (s1, a1, l1, k1), (s2, a2, l2, k2) = COMPOSITES[rel]
    ref_lo = git_audio(f"public/audio/{rel}", LO, 1)
    join = l1 - XFADE                      # composite time the join starts
    for src, start, t in ((s1, a1, 40.0), (s2, a2, join + XFADE + 20.0)):
        if t + PROBE > period - 1:
            continue    # the part only enters the loop in the join itself
        probe = ref_lo[int(t * LO):int((t + PROBE) * LO)]
        k, r = ncc_peak(decode(src, LO, 1), probe)
        want = start + (t if src == s1 else t - join)
        if abs(k / LO - want) > 0.02 or r < 0.9:
            raise ValueError(f"composite part {os.path.basename(src)} found at "
                             f"{k / LO:.2f}s (r={r:.2f}), recipe says {want:.2f}s")
    def part(src, a, l, kind):
        if kind != "pixabay":
            return decode(src, SR, 2, a, l)
        # Each part was its own Pixabay-recipe intermediate: faded 3 s at
        # both ends and normalised on its own, before the join.
        chain = f"afade=t=in:d=3,afade=t=out:st={l - 3:g}:d=3,loudnorm=I=-23"
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{a}", "-t", f"{l}",
                            "-i", src, "-af", chain, "-ac", "2", "-ar", str(SR),
                            "-f", "f32le", "-"], capture_output=True, check=True)
        return np.frombuffer(r.stdout, np.float32).reshape(-1, 2)
    p1 = part(s1, a1, l1, k1)
    p2 = part(s2, a2, l2, k2)
    ref = git_audio(f"public/audio/{rel}", SR, 2)
    rms = lambda z: float(np.sqrt((z.astype(np.float64) ** 2).mean()))
    # Per-part gains, each measured well away from the join.
    g1 = rms(ref[int(C * SR):int((join - 10) * SR)]) / rms(p1[int(C * SR):int((join - 10) * SR)])
    lo2, hi2 = join + XFADE + 10, min(period - 1, join + l2 - 10)
    if (s2, a2) == (s1, a1) or hi2 - lo2 < 20:
        g2 = g1          # same recording, or too little of part 2 to measure
    else:
        g2 = (rms(ref[int(lo2 * SR):int(hi2 * SR)])
              / rms(p2[int((lo2 - join) * SR):int((hi2 - join) * SR)]))
    n = int(XFADE * SR)
    u = (np.arange(n) / n)[:, None]         # triangular, as the recipe's acrossfade
    j = int(join * SR)
    comp = np.concatenate([p1[:j] * g1,
                           p1[j:j + n] * g1 * (1 - u) + p2[:n] * g2 * u,
                           p2[n:] * g2])
    need = int((period + C + 1.0) * SR)
    if len(comp) < need:
        raise ValueError("composite too short for the tail")
    return comp[:need], 20 * np.log10(g1), 20 * np.log10(g2)


def git_json(rel):
    r = subprocess.run(["git", "-C", ROOT, "show", f"{REFERENCE_REV}:{rel}"],
                       capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 else {}


def git_audio(rel, rate, channels):
    r = subprocess.run(f"git -C '{ROOT}' show {REFERENCE_REV}:'{rel}' | ffmpeg -v error "
                       f"-i - -ac {channels} -ar {rate} -f f32le -",
                       shell=True, capture_output=True, check=True)
    x = np.frombuffer(r.stdout, np.float32)
    return x.reshape(-1, channels) if channels > 1 else x


def decode(path, rate, channels, start=None, dur=None):
    cmd = ["ffmpeg", "-v", "error"]
    if start is not None:
        cmd += ["-ss", f"{max(0.0, start):.6f}"]
    if dur is not None:
        cmd += ["-t", f"{dur:.6f}"]
    cmd += ["-i", path, "-ac", str(channels), "-ar", str(rate), "-f", "f32le", "-"]
    x = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout,
                      np.float32)
    return x.reshape(-1, channels) if channels > 1 else x


def source_for(rel, side):
    """(source path, prior start seconds or None) for a shipped variant."""
    url = side.get("sourceUrl", "")
    for vid, path in YOUTUBE.items():
        if vid in url:
            cut = None
            import re
            m = re.search(r"cut @([0-9]+)s", json.dumps(side))
            if m:
                cut = float(m.group(1))
            return path, cut
    parts = rel.split("/")               # scene/element/variant.opus
    norm = os.path.join(NORM, f"{parts[0]}__{parts[1]}__{parts[2][:-5]}.wav")
    if os.path.exists(norm):
        return norm, side.get("processing", {}).get("loopStartSeconds")
    orig = side.get("originalFilename", "")
    cand = os.path.join(RAW, os.path.basename(orig)) if orig else ""
    if cand and os.path.exists(cand):
        return cand, None
    return None, None


def ncc_peak(src, probe):
    """Offset (samples) and normalised correlation of `probe` in `src`."""
    n = len(src) + len(probe)
    nfft = 1 << (n - 1).bit_length()
    c = np.fft.irfft(np.fft.rfft(src, nfft) * np.conj(np.fft.rfft(probe, nfft)), nfft)
    c = c[:len(src) - len(probe) + 1]
    e = np.cumsum(np.concatenate([[0.0], src.astype(np.float64) ** 2]))
    win = np.sqrt(np.maximum(e[len(probe):] - e[:-len(probe)], 1e-20))
    r = c / (win * np.sqrt((probe.astype(np.float64) ** 2).sum()) + 1e-20)
    k = int(np.argmax(r))
    return k, float(r[k])


def align(rel, period, src, prior):
    """Source time (s) at which the shipped loop's t=0 sits, or raise."""
    shipped = git_audio(f"public/audio/{rel}", LO, 1)
    if prior is not None:
        w0 = max(0.0, prior - 90.0)
        s = decode(src, LO, 1, w0, period + 180.0)
    else:
        w0 = 0.0
        s = decode(src, LO, 1)
    hits = []
    for t in (40.0, period - PROBE - 10.0):
        probe = shipped[int(t * LO):int((t + PROBE) * LO)]
        k, r = ncc_peak(s, probe)
        hits.append((w0 + k / LO - t, r))
    (s1, r1), (s2, r2) = hits
    if abs(s1 - s2) > AGREE_S * 4 or min(r1, r2) < 0.5:
        raise ValueError(f"probes disagree: {s1:.3f}s (r={r1:.2f}) vs "
                         f"{s2:.3f}s (r={r2:.2f})")
    # Refine at full rate within +-2 ms.
    coarse = (s1 + s2) / 2
    ref = git_audio(f"public/audio/{rel}", SR, 1)[int(40 * SR):int(60 * SR)]
    fine = decode(src, SR, 1, coarse + 40.0 - 0.01, PROBE + 0.02)
    k, r = ncc_peak(fine, ref)
    return coarse - 0.01 + k / SR, min(r1, r2), r


# Processing the original recipe applied that its sidecar never recorded,
# established by measurement (and now written into the re-cut's sidecar).
# The rain-on-window rumbles: a 2-pole low-pass at 600 Hz, -3 dB at 630 Hz
# and 12 dB/octave above, exactly as tools/grow-out-scenes.sh describes the
# "rain-on-window convention" for distant thunder.
UNRECORDED_FILTERS = {
    "rain-on-window/distant-thunder-rumble/rumble-1.opus": "lowpass=f=600",
    "rain-on-window/distant-thunder-rumble/rumble-2.opus": "lowpass=f=600",
}


def recorded_filters(side, rel=None):
    if rel in UNRECORDED_FILTERS:
        return UNRECORDED_FILTERS[rel]
    return _notes_filters(side)


def _notes_filters(side):
    """ffmpeg filters the original recipe applied on top of the source, as
    far as the notes record them. Only the 2.8 kHz 'distance' low-pass of
    the 2026-07-01 far/distant cuts has turned up; the spectral check in
    recut() refuses anything else unrecorded."""
    import re
    m = re.search(r"lowpass ([0-9.]+)\s*kHz", json.dumps(side))
    return f"lowpass=f={float(m.group(1)) * 1000:.0f}" if m else None


def third_octaves(x):
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    out = []
    for c in [63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000,
              1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
              12500, 16000]:
        sel = (f >= c / 2 ** (1 / 6)) & (f < c * 2 ** (1 / 6))
        out.append(10 * np.log10(spec[sel].sum() + 1e-20))
    return np.array(out)


SPECTRAL_TOLERANCE_DB = 1.5
CONTOUR_TOLERANCE_DB = 1.5
# Files whose exact recipe input is gone, with the tolerance they are held
# to instead and why. Keep this short, and empty it when a source returns.
CONTOUR_EXCEPTIONS = {
    # The shipped cut was levelled (dynaudnorm) from the raw 8-channel ORTF
    # master, which went with the ORTF3D RAIN_02 zip. Re-levelling the cut
    # from the stored, already-levelled master lands within +-1.8 dB in 10 s
    # windows. Exact once Andrew re-downloads RAIN_02 (#669).
    "monsoon/rain/rain-4.opus": 4.0,
}
CONTOUR_WINDOW = 10.0


def normalizer_candidates(side):
    """The level processing the original recipe may have used, as ffmpeg
    filters to try; None is a single static gain. The notes say *that*
    loudnorm ran, rarely with every parameter, so the candidates cover what
    they leave open and the level contour picks the one that reproduces the
    shipped file. Single-pass loudnorm rides the level (on forest-2 it
    pulled an insect burst down 8 dB), so a static gain alone would change
    how a vetted file moves over time."""
    import re
    txt = json.dumps(side)
    cands = [None]
    lev = side.get("processing", {}).get("leveling", "")
    if lev.startswith("dynaudnorm"):
        # FTUS masters are levelled already, but the recipe may have levelled
        # the trimmed cut again (rain-4's master runs 7.5 dB hot in its first
        # minute; the shipped cut does not). Re-running it on the cut
        # reproduces that; a static gain is tried too.
        cands.append(lev)
    if "two-pass linear" in txt:
        return cands                      # linear loudnorm is a static gain
    num = r"(-?[0-9]+(?:\.[0-9]+)?)"      # not the sentence's full stop
    m = re.search(rf"loudnorm I={num} LUFS TP={num}", txt)
    if m:
        tps = [float(m.group(2))]
        i = float(m.group(1))
    else:
        m = re.search(rf"[Ll]oudnorm (?:I=)?{num} LUFS", txt)
        if not m:
            return cands
        i, tps = float(m.group(1)), [-2.0, -1.5, -1.0]
    for tp in tps:
        for lra in (11, 7):
            cands.append(f"loudnorm=I={i:g}:TP={tp:g}:LRA={lra}")
    return cands


def recipe_prefix(side):
    """Steps at the very start of the original intermediate. The Pixabay-era
    recipe ("5s head trim, 3s fades each end, ... loudnorm -23 LUFS") faded
    the intermediate in over 3 s before normalising it, and that fade sets
    where single-pass loudnorm starts: without it, rumble-2's first 10 s
    came out 2.4 dB off; with it, the whole contour matches within 0.07 dB.
    The faded head lands inside the wrap crossfade, where it costs at most
    about 0.5 dB for a second or two."""
    return ["afade=t=in:d=3"] if "3s fades each end" in json.dumps(side) else []


def process(src, start, period, chain):
    """Source from `start`, through the ffmpeg `chain`, as the original
    intermediate began: P + C + 1 s, stereo, 48 kHz. Run 20 s long so a
    look-ahead normaliser treats the tail like the rest."""
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start:.6f}", "-t", f"{period + C + 20.0:.3f}",
           "-i", src]
    if chain:
        cmd += ["-af", ",".join(chain)]
    cmd += ["-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    x = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout,
                      np.float32).reshape(-1, 2)
    return x[:int((period + C + 1.0) * SR)]


def contour_spread(seg, ref, period):
    """Spread (max - min, dB) of the shipped/re-cut level ratio in 10 s
    windows over the loop body: 0 means the re-cut moves exactly as the
    shipped file does."""
    w = int(CONTOUR_WINDOW * SR)
    g = []
    for i in range(int(C * SR), int((period - 1) * SR) - w, w):
        a = float((seg[i:i + w].astype(np.float64) ** 2).mean())
        b = float((ref[i:i + w].astype(np.float64) ** 2).mean())
        g.append(10 * np.log10((b + 1e-20) / (a + 1e-20)))
    return max(g) - min(g) if g else 0.0


def recut(rel, period, src, start, out, filt, seg=None, side=None):
    """Rebuild the loop from the source at `start` (or a prebuilt `seg`,
    for a composite): the original recipe's filters and normaliser, a
    static gain onto the shipped level, then `seamless_loop()`. Returns
    (gain_db, corr_after, worst_band_db, contour_db, normaliser)."""
    ref = git_audio(f"public/audio/{rel}", SR, 2)
    refm = ref.mean(axis=1)
    rms = lambda z: float(np.sqrt((z.astype(np.float64) ** 2).mean()))
    a, b = int(C * SR), int((period - 1) * SR)
    best = None
    if seg is not None:
        options = [(None, seg)]
        for norm in normalizer_candidates(side or {})[1:]:
            r = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ac", "2",
                                "-ar", str(SR), "-i", "-", "-af", norm,
                                "-ar", str(SR), "-f", "f32le", "-"],
                               input=seg.astype(np.float32).tobytes(),
                               capture_output=True, check=True)
            options.append((norm, np.frombuffer(r.stdout, np.float32).reshape(-1, 2)))
    else:
        options = []
        for norm in normalizer_candidates(side or {}):
            chain = recipe_prefix(side or {}) + [f for f in (filt, norm) if f]
            options.append((norm, process(src, start, period, chain)))
    for norm, s in options:
        if len(s) < int((period + C) * SR):
            raise ValueError(f"source ends {len(s) / SR:.1f}s after the cut; "
                             f"needs {period + C:.0f}s")
        spread = contour_spread(s.mean(axis=1), refm, period)
        if best is None or spread < best[0] - 0.05:
            best = (spread, norm, s)
    spread, norm, seg = best
    if spread > CONTOUR_EXCEPTIONS.get(rel, CONTOUR_TOLERANCE_DB):
        raise ValueError(f"level contour differs from the shipped file by "
                         f"{spread:.1f} dB over time (best: {norm or 'static'}); "
                         f"unrecorded processing?")
    gain = rms(ref[a:b]) / max(rms(seg[a:b]), 1e-12)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as t:
        tmp = t.name
    try:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ac", "2",
                        "-ar", str(SR), "-i", "-", "-c:a", "pcm_f32le", tmp],
                       input=(seg * gain).astype(np.float32).tobytes(), check=True)
        loopify.seamless_loop(tmp, out, period, SR, start=0)
    finally:
        os.remove(tmp)
    # Downmix both sides the same way: ffmpeg's -ac 1 is not a plain mean,
    # and mixing the two methods reads as a flat 3 dB error in every band.
    new = decode(out, SR, 2).mean(axis=1)
    m = min(len(new), len(ref))
    x, y = new[a:m - SR], ref[a:m - SR].mean(axis=1)
    corr = float(np.dot(x, y) / (np.linalg.norm(x) * np.linalg.norm(y) + 1e-20))
    # Same audio should have the same spectrum. A band off by more than the
    # tolerance means the recipe did something the notes don't record.
    # The 16 kHz band is left out: files that lived through 192k MP3
    # generations (pavement-2 had two) differ there from one Opus encode by a
    # couple of dB, and nothing a sleeper hears lives above 14 kHz.
    bx, by = third_octaves(x)[:-1], third_octaves(y)[:-1]
    active = by > by.max() - 40
    worst = float(np.abs(bx - by)[active].max())
    if worst > SPECTRAL_TOLERANCE_DB:
        os.remove(out)
        raise ValueError(f"spectrum differs from the shipped file by "
                         f"{worst:.1f} dB in some band; unrecorded processing?")
    return 20 * np.log10(gain), corr, worst, spread, norm


def tonal_repair_cmd():
    """The interpreter for repair-tonal-events.py. It needs librosa and
    soundfile; librosa is not packaged for this Ubuntu, so when the system
    Python lacks it, run it in a throwaway uv environment instead of
    installing into the system site."""
    try:
        import librosa  # noqa: F401
        import soundfile  # noqa: F401
        return [sys.executable]
    except ImportError:
        uv = os.path.expanduser("~/.local/bin/uv")
        return [uv, "run", "--quiet", "--python", "3.12", "--with", "librosa",
                "--with", "soundfile", "python"]


def targets(only):
    import glob
    out = []
    for sj in sorted(glob.glob(os.path.join(ROOT, "public", "scenes", "*.json"))):
        if sj.endswith("index.json"):
            continue
        s = json.load(open(sj, encoding="utf-8"))
        for el in s.get("elements", []):
            for v in el["variants"]:
                url = v if isinstance(v, str) else v["url"]
                rel = url.split("/audio/", 1)[1]
                if only and not any(rel.startswith(o) for o in only):
                    continue
                if rel not in [r for r, _ in out]:
                    out.append((rel, el["loopOffsetSeconds"]))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("only", nargs="*", help="scene/element/variant prefixes")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--list", help="file of scene/element/variant.opus paths to re-cut")
    args = ap.parse_args()
    wanted = None
    if args.list:
        wanted = {l.strip() for l in open(args.list) if l.strip()}
    today = datetime.date.today().isoformat()
    for rel, period in targets(args.only):
        if wanted is not None and rel not in wanted:
            continue
        side = git_json(f"public/audio/{rel[:-5]}.json")
        if rel in COMPOSITES:
            try:
                seg, g1, g2 = build_composite(rel, period)
            except ValueError as e:
                print(f"  SKIP  {rel}: {e}")
                continue
            line = (f"{rel}: composite of "
                    + " + ".join(os.path.basename(s)[:28] for s, _, _, _ in COMPOSITES[rel])
                    + f" (part gains {g1:+.1f}/{g2:+.1f} dB)")
            if args.dry_run:
                print(f"  ok    {line}")
                continue
            out = os.path.join(AUDIO, rel)
            tmp = out + ".tmp.opus"
            try:
                _, corr, worst, spread, norm = recut(rel, period, None, 0.0, tmp, None,
                                                     seg=seg, side=side)
            except ValueError as e:
                print(f"  SKIP  {rel}: {e}")
                continue
            os.replace(tmp, out)
            side.setdefault("processing", {}).pop("wrapPatch", None)
            side["processing"]["recut"] = {
                "date": today, "tool": "tools/recut-from-source.py",
                "composite": [{"source": os.path.relpath(s, SOUNDS), "startSeconds": a,
                               "lengthSeconds": l, "partRecipe": k}
                              for s, a, l, k in COMPOSITES[rel]],
                "joinCrossfadeSeconds": XFADE,
                "partGainsDb": [round(g1, 2), round(g2, 2)],
                "matchToShipped": round(corr, 3),
                "worstThirdOctaveVsShippedDb": round(worst, 2),
                "levelContourSpreadDb": round(spread, 2),
                "normaliser": norm or "static gain",
                "why": ("Rebuilt from its two source recordings with the "
                        "recipe's 20 s join, and re-cut with the fixed tool so "
                        "the wrap crossfades into the audio that follows the "
                        "loop. DECISIONS.md, 'The wrap was a hole'."),
            }
            with open(out[:-5] + ".json", "w", encoding="utf-8") as f:
                json.dump(side, f, indent=2)
                f.write("\n")
            print(f"  recut {line}, match {corr:.3f}, worst band {worst:.2f} dB, "
                  f"contour {spread:.2f} dB")
            continue
        src, prior = source_for(rel, side)
        if not src:
            print(f"  NOSRC {rel}")
            continue
        try:
            start, r_coarse, r_fine = align(rel, period, src, prior)
        except ValueError as e:
            print(f"  SKIP  {rel}: {e}")
            continue
        line = (f"{rel}: source {os.path.basename(src)[:48]} @ {start:.4f}s "
                f"(r {r_coarse:.2f}/{r_fine:.2f})")
        if args.dry_run:
            print(f"  ok    {line}")
            continue
        out = os.path.join(AUDIO, rel)
        tmp = out + ".tmp.opus"
        filt = recorded_filters(side, rel)
        try:
            gain_db, corr, worst, spread, norm = recut(rel, period, src, start, tmp,
                                                       filt, side=side)
        except ValueError as e:
            print(f"  SKIP  {rel}: {e}")
            continue
        os.replace(tmp, out)
        repaired = False
        if "tonalRepair" in side.get("processing", {}):
            subprocess.run(tonal_repair_cmd() + [os.path.join(ROOT, "tools",
                            "repair-tonal-events.py"), out, "--in-place"],
                           check=True, capture_output=True)
            repaired = True
        side.setdefault("processing", {}).pop("wrapPatch", None)
        side["processing"]["recut"] = {
            "date": today,
            "tool": "tools/recut-from-source.py",
            "source": os.path.relpath(src, SOUNDS),
            "sourceStartSeconds": round(start, 4),
            "gainDb": round(gain_db, 2),
            "filter": filt,
            "filterWasUnrecorded": rel in UNRECORDED_FILTERS,
            "recipePrefix": recipe_prefix(side) or None,
            "normaliser": norm or "static gain",
            "levelContourSpreadDb": round(spread, 2),
            "contourException": (f"held to {CONTOUR_EXCEPTIONS[rel]} dB: raw master gone; "
                                 "see CONTOUR_EXCEPTIONS" if rel in CONTOUR_EXCEPTIONS else None),
            "worstThirdOctaveVsShippedDb": round(worst, 2),
            "matchToShipped": round(corr, 3),
            "tonalRepairReapplied": repaired,
            "why": ("loopify-scenes.py never mixed the wrap crossfade tail in, "
                    "so the loop wrapped into a fade-up from near silence. "
                    "Re-cut from the source at the same window (found by "
                    "cross-correlation against the shipped file) with the "
                    "fixed tool: a real equal-power crossfade into the audio "
                    "that follows the loop in the recording. DECISIONS.md, "
                    "'The wrap was a hole'."),
        }
        with open(out[:-5] + ".json", "w", encoding="utf-8") as f:
            json.dump(side, f, indent=2)
            f.write("\n")
        print(f"  recut {line} gain {gain_db:+.2f} dB, match {corr:.3f}, "
              f"worst band {worst:.2f} dB, contour {spread:.2f} dB, "
              f"{norm or 'static gain'}" + (f", {filt}" if filt else "")
              + (", birds re-repaired" if repaired else ""))


if __name__ == "__main__":
    main()
