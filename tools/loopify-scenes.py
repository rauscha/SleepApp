#!/usr/bin/env python3
"""loopify-scenes.py — restore the brief in the Howler (native-loop) engine.

Three jobs, all idempotent (re-runnable):

  1. Synth-bed carrier: generate a seamless, quiet noise loop per color
     (brown / pink / white) at 887s — the 5th canonical prime, so the bed is
     incommensurate with the element offsets (251/409/521/691). HowlScene
     plays it as a looping layer under every scene.

  2. forest-evening owns scene-local copies of the two forest-day elements it
     reuses at DIFFERENT primes (wind-in-leaves @409, distant-birds @521), so
     each physical file has exactly one native loop length.

  3. Seamless loops: trim every scene variant to its element's
     loopOffsetSeconds with a gapless wrap, so native HTML5 looping has no
     periodic seam/tick. Because each element in a scene sits on a distinct
     prime, the combined pattern's repeat period is the LCM of the primes —
     tens of hours (Eno's incommensurate-loops technique), now enforced by
     the file lengths themselves rather than a chain timer.

Seamless-loop method (validated): take the C-second segment just PAST the loop
point, fade it out, sum it over a faded-in copy of the head, and concat that
wrap region in front of the clean middle [C:offset]. The file then ends where
it began, so loop wrap is continuous. Three input handles avoid asplit
buffering issues; no loudnorm on scene files (preserves their existing voiced
levels).
"""
import glob
import json
import os
import subprocess
import tempfile

C = 6  # wrap crossfade seconds
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "public", "audio")
SCENES = os.path.join(ROOT, "public", "scenes")
BED_LENGTH = 887
BED_COLORS = ["brown", "pink", "white"]

# forest-day element dirs that forest-evening reuses at a different prime →
# give forest-evening its own copies. (src basename → dst dir.)
FE_LOCAL_COPIES = [
    ("forest-day/wind-in-leaves", "forest-evening/wind-in-leaves"),
    ("forest-day/distant-birds", "forest-evening/distant-birds"),
]


def probe_duration(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path], text=True).strip()
    return float(out)


def probe_sr(path):
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=sample_rate", "-of", "csv=p=0", path],
            text=True).strip()
        return int(out)
    except Exception:
        return 44100


def seamless_loop(src, out, period, sr, loudnorm=None):
    """Write `out`: a seamless loop of length `period` built from `src`."""
    fmt = (f"aformat=sample_fmts=fltp:channel_layouts=stereo:"
           f"sample_rates={sr}")
    pre = f",{loudnorm}" if loudnorm else ""
    fc = (
        f"[0:a]atrim=0:{C},{fmt},afade=t=in:st=0:d={C},asetpts=PTS-STARTPTS[head];"
        f"[1:a]atrim={period}:{period + C},{fmt},afade=t=out:st=0:d={C},asetpts=PTS-STARTPTS[tailf];"
        f"[head][tailf]amix=inputs=2:normalize=0{pre},{fmt}[wrap];"
        f"[2:a]atrim={C}:{period},{fmt},asetpts=PTS-STARTPTS[mid];"
        f"[wrap][mid]concat=n=2:v=0:a=1[out]"
    )
    subprocess.check_call(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-i", src, "-i", src, "-i", src,
         "-filter_complex", fc, "-map", "[out]",
         "-ac", "2", "-ar", str(sr), "-b:a", "192k", out])


def loopify_in_place(path, period):
    d = probe_duration(path)
    if abs(d - period) < 2:
        print(f"    skip {os.path.relpath(path, ROOT)} ({d:.1f}s ≈ {period})")
        return
    if d < period + C:
        print(f"    WARN {os.path.relpath(path, ROOT)} too short "
              f"({d:.1f}s < {period + C}) — left as-is")
        return
    sr = probe_sr(path)
    tmp = path + ".tmp.mp3"
    seamless_loop(path, tmp, period, sr)
    nd = probe_duration(tmp)
    os.replace(tmp, path)
    print(f"    loop {os.path.relpath(path, ROOT)}: {d:.1f}s → {nd:.1f}s "
          f"(prime {period})")


def update_sidecar(path, period):
    sc = path[:-4] + ".json"
    if not os.path.exists(sc):
        return
    j = json.load(open(sc))
    j["trimmedTo"] = f"{period}s"
    note = j.get("notes", "")
    tag = (f" Seamless-looped to {period}s (prime loopOffset) for native "
           f"Howler looping: {C}s fade-wrap of the post-loop tail over the "
           f"head so the loop point is gapless.")
    if "Seamless-looped" not in note:
        j["notes"] = (note + tag).strip()
    json.dump(j, open(sc, "w"), indent=2)


def gen_beds():
    print("## synth-bed carriers")
    bed_dir = os.path.join(AUDIO, "_bed")
    os.makedirs(bed_dir, exist_ok=True)
    for color in BED_COLORS:
        out = os.path.join(bed_dir, f"{color}.mp3")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as t:
            raw = t.name
        try:
            # Generate a bit more than 887+C of colored noise, normalized to a
            # quiet bed reference (-23 LUFS); the per-scene synth volume
            # (0.08–0.16) sets the final level.
            subprocess.check_call(
                ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                 "-f", "lavfi", "-i",
                 f"anoisesrc=d={BED_LENGTH + C + 4}:c={color}:a=0.9:r=44100",
                 "-af", "loudnorm=I=-23:TP=-1.5:LRA=7",
                 "-ac", "2", "-ar", "44100", "-b:a", "160k", raw])
            seamless_loop(raw, out, BED_LENGTH, 44100)
        finally:
            os.path.exists(raw) and os.remove(raw)
        sc = out[:-4] + ".json"
        json.dump({
            "source": "Generated (ffmpeg anoisesrc)",
            "license": "Generated synthetic noise — no third-party rights.",
            "outputFormat": "44.1 kHz / 192 kbps / stereo MP3",
            "trimmedTo": f"{BED_LENGTH}s",
            "notes": (f"{color} noise synth-bed carrier, loudnorm I=-23, "
                      f"seamless-looped to {BED_LENGTH}s (prime, coprime to "
                      f"the element offsets). Played by HowlScene as the "
                      f"spectral-glue bed under every scene of this color."),
        }, open(sc, "w"), indent=2)
        print(f"    bed {os.path.relpath(out, ROOT)} "
              f"({probe_duration(out):.1f}s)")


def make_fe_copies():
    print("## forest-evening scene-local copies")
    import shutil
    for src_rel, dst_rel in FE_LOCAL_COPIES:
        src_dir = os.path.join(AUDIO, src_rel)
        dst_dir = os.path.join(AUDIO, dst_rel)
        os.makedirs(dst_dir, exist_ok=True)
        for fn in os.listdir(src_dir):
            dst = os.path.join(dst_dir, fn)
            if os.path.exists(dst):
                continue  # don't clobber an already-trimmed local copy
            shutil.copy2(os.path.join(src_dir, fn), dst)
            print(f"    copy {dst_rel}/{fn}")


def loopify_scenes():
    for f in sorted(glob.glob(os.path.join(SCENES, "*.json"))):
        if f.endswith("index.json"):
            continue
        d = json.load(open(f))
        print(f"## {d['id']}")
        for el in d["elements"]:
            period = el["loopOffsetSeconds"]
            for v in el["variants"]:
                path = os.path.join(ROOT, "public" + v["url"])
                if not os.path.exists(path):
                    print(f"    MISSING {v['url']}")
                    continue
                loopify_in_place(path, period)
                update_sidecar(path, period)


if __name__ == "__main__":
    gen_beds()
    make_fe_copies()
    loopify_scenes()
    print("done.")
