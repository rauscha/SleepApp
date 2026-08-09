#!/usr/bin/env python3
"""loopify-scenes.py — restore the brief in the Howler (native-loop) engine.

Two jobs, both idempotent (re-runnable):

  1. Synth-bed carrier: generate a seamless, quiet noise loop per color
     (brown / pink / white) at 887s — the 5th canonical prime, so the bed is
     incommensurate with the element offsets (251/409/521/691). HowlScene
     plays it as a looping layer under every scene.

  2. Seamless loops: trim every scene variant to its element's
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

Output format (2026-06-30 decision, see DECISIONS.md "Ship scene audio as
Opus, not MP3"): every file this script touches is emitted as **Opus**
(libopus, OUTPUT_BITRATE), not MP3 — MP3's ~16kHz lowpass strips the noise
"air" that matters for this material; Opus preserves to ~20kHz at a smaller
size. Input can be any ffmpeg-readable format (mp3, wav, opus, ogg — e.g. the
Opus files yt-dlp already hands back from YouTube); output is always
`<stem>.opus`. When the input isn't already `.opus`, `loopify_in_place`
renames: the old-extension file is removed and the scene JSON / sidecar are
updated to point at the new `.opus` path, so re-running this script against
an still-MP3 scene migrates it in place.
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

C = 6  # wrap crossfade seconds
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "public", "audio")
SCENES = os.path.join(ROOT, "public", "scenes")
BED_LENGTH = 887
BED_COLORS = ["brown", "pink", "white"]
OUTPUT_BITRATE = "128k"  # transparent for field-recording ambience + noise beds
# libopus only encodes at 8/12/16/24/48 kHz (it internally resamples to one of
# these regardless of input) — our old MP3 pipeline standardized on 44.1kHz,
# which libopus rejects outright. 48000 is its native/highest rate and what
# our new sources (YouTube, mostly) already deliver, so all Opus output — loop
# trims and synth beds alike — targets 48000 Hz now, not the source's rate.
OPUS_SR = 48000

def probe_duration(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path], text=True).strip()
    return float(out)


def seamless_loop(src, out, period, sr, loudnorm=None):
    """Write `out`: a seamless Opus loop of length `period` built from `src`."""
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
         "-ac", "2", "-ar", str(sr), "-c:a", "libopus", "-b:a", OUTPUT_BITRATE, out])


def loopify_in_place(path, period):
    """Trim `path` to a seamless `period`-second loop, emitting Opus.

    Returns the final path (unchanged if `path` was already `.opus`; a
    sibling `<stem>.opus` — with the old file removed — otherwise), or None
    if left as-is (already correct length, or too short to trim).
    """
    d = probe_duration(path)
    stem, ext = os.path.splitext(path)
    opus_path = stem + ".opus"
    already_opus = ext.lower() == ".opus"
    if already_opus and abs(d - period) < 2:
        print(f"    skip {os.path.relpath(path, ROOT)} ({d:.1f}s ~= {period})")
        return None
    if d < period + C:
        print(f"    WARN {os.path.relpath(path, ROOT)} too short "
              f"({d:.1f}s < {period + C}) — left as-is")
        return None
    tmp = opus_path + ".tmp.opus"
    seamless_loop(path, tmp, period, OPUS_SR)
    nd = probe_duration(tmp)
    os.replace(tmp, opus_path)
    # NB: plain ASCII in prints — a fancy arrow here crashed the whole run
    # mid-migration on Windows' default cp1252 console (2026-07-01).
    if not already_opus:
        os.remove(path)
        print(f"    loop {os.path.relpath(path, ROOT)} -> "
              f"{os.path.relpath(opus_path, ROOT)}: {d:.1f}s -> {nd:.1f}s "
              f"(prime {period}, migrated to Opus)")
    else:
        print(f"    loop {os.path.relpath(opus_path, ROOT)}: {d:.1f}s -> {nd:.1f}s "
              f"(prime {period})")
    return opus_path


def update_sidecar(path, period, renamed_from=None):
    stem, _ = os.path.splitext(path)
    sc = stem + ".json"
    old_sc = os.path.splitext(renamed_from)[0] + ".json" if renamed_from else sc
    if not os.path.exists(old_sc):
        return
    j = json.load(open(old_sc, encoding="utf-8"))
    j["trimmedTo"] = f"{period}s"
    j["outputFormat"] = j.get("outputFormat", "").replace("MP3", "Opus") or "Opus"
    note = j.get("notes", "")
    tag = (f" Seamless-looped to {period}s (prime loopOffset) for native "
           f"Howler looping: {C}s fade-wrap of the post-loop tail over the "
           f"head so the loop point is gapless. Encoded as Opus "
           f"({OUTPUT_BITRATE}) — see DECISIONS.md 'Ship scene audio as "
           f"Opus, not MP3'.")
    if "Seamless-looped" not in note:
        j["notes"] = (note + tag).strip()
    json.dump(j, open(sc, "w", encoding="utf-8"), indent=2)
    if old_sc != sc and os.path.exists(old_sc):
        os.remove(old_sc)


def gen_beds(force=False):
    print("## synth-bed carriers")
    bed_dir = os.path.join(AUDIO, "_bed")
    os.makedirs(bed_dir, exist_ok=True)
    for color in BED_COLORS:
        old_mp3 = os.path.join(bed_dir, f"{color}.mp3")
        if os.path.exists(old_mp3):
            os.remove(old_mp3)  # superseded by the .opus bed below
        out = os.path.join(bed_dir, f"{color}.opus")
        # Skip guard: the beds are pure generated noise. Regenerating a bed
        # that already exists at the right length only rewrites ~10 MB of
        # fresh random bytes per color on a Drive-synced, git-tracked repo —
        # audible change zero, churn large. Re-render only on --force-beds
        # (the fixed seed below makes even that deterministic).
        if not force and os.path.exists(out):
            existing = probe_duration(out)
            if abs(existing - BED_LENGTH) < 2:
                print(f"    skip {os.path.relpath(out, ROOT)} "
                      f"({existing:.1f}s ~= {BED_LENGTH})")
                continue
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as t:
            raw = t.name
        try:
            # Generate a bit more than 887+C of colored noise, normalized to a
            # quiet bed reference (-23 LUFS); the per-scene synth volume
            # (0.08–0.16) sets the final level. Raw intermediate is lossless
            # WAV — seamless_loop() does the one lossy (Opus) encode. Fixed
            # seed so a forced regeneration is byte-deterministic.
            subprocess.check_call(
                ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                 "-f", "lavfi", "-i",
                 f"anoisesrc=d={BED_LENGTH + C + 4}:c={color}:a=0.9:"
                 f"r={OPUS_SR}:seed=471102",
                 "-af", "loudnorm=I=-23:TP=-1.5:LRA=7",
                 "-ac", "2", "-ar", str(OPUS_SR), raw])
            seamless_loop(raw, out, BED_LENGTH, OPUS_SR)
        finally:
            os.path.exists(raw) and os.remove(raw)
        sc = os.path.splitext(out)[0] + ".json"
        json.dump({
            "source": "Generated (ffmpeg anoisesrc)",
            "license": "Generated synthetic noise — no third-party rights.",
            "outputFormat": f"44.1 kHz / {OUTPUT_BITRATE} / stereo Opus",
            "trimmedTo": f"{BED_LENGTH}s",
            "notes": (f"{color} noise synth-bed carrier, loudnorm I=-23, "
                      f"seamless-looped to {BED_LENGTH}s (prime, coprime to "
                      f"the element offsets). Played by HowlScene as the "
                      f"spectral-glue bed under every scene of this color."),
        }, open(sc, "w", encoding="utf-8"), indent=2)
        print(f"    bed {os.path.relpath(out, ROOT)} "
              f"({probe_duration(out):.1f}s)")


def loopify_scenes():
    for f in sorted(glob.glob(os.path.join(SCENES, "*.json"))):
        if f.endswith("index.json"):
            continue
        d = json.load(open(f, encoding="utf-8"))
        print(f"## {d['id']}")
        dirty = False
        for el in d["elements"]:
            period = el["loopOffsetSeconds"]
            for v in el["variants"]:
                path = os.path.join(ROOT, "public" + v["url"])
                if not os.path.exists(path):
                    print(f"    MISSING {v['url']}")
                    continue
                new_path = loopify_in_place(path, period)
                if new_path is None:
                    continue
                update_sidecar(new_path, period, renamed_from=path if new_path != path else None)
                if new_path != path:
                    # Extension changed (mp3 -> opus): point the scene JSON
                    # at the new file so the app resolves the right URL.
                    new_url = "/" + os.path.relpath(new_path, os.path.join(ROOT, "public")).replace(os.sep, "/")
                    v["url"] = new_url
                    dirty = True
        if dirty:
            json.dump(d, open(f, "w", encoding="utf-8"), indent=2)
            print(f"    updated {os.path.relpath(f, ROOT)} (variant URLs -> .opus)")


if __name__ == "__main__":
    gen_beds(force="--force-beds" in sys.argv)
    loopify_scenes()
    print("done.")
