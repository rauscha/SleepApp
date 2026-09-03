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

Start-offset seam search (2026-09-02, see DECISIONS.md): the trim no longer
starts at t=0. A raw field recording almost always opens with a fade-in or the
recordist settling, so a wrap built from [0, C] is continuous but carries a
10-17 dB LEVEL STEP against the settled tail -- every P seconds, all night.
`tools/seamfit.py` measures a one-frame-per-second dB envelope and searches a
start offset S minimising the level difference ACROSS the wrap -- the C seconds
just before it (source [S+P-C, S+P]) against the C seconds just after it
([S+C, S+2C]) -- penalising windows more than 4 dB off the file's own mean
level so the seam lands somewhere representative. (Matching the head and tail
windows themselves is the obvious formulation and is wrong; see seamfit's
docstring.) Any residual step is flattened by an end-matching gain tilt: a
linear-in-dB ramp gain_dB(t) = (t-S)*D/P across the trimmed segment, which
walks the tail onto the head over minutes (inaudible drift) instead of leaving
a step at the wrap (audible tick). Sources with no slack (dur ~= P + C) still
trim from S=0.

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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seamfit  # noqa: E402  (needs the path insert above to import from any cwd)

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


def seamless_loop(src, out, period, sr, loudnorm=None, start=0, tilt_db=0.0):
    """Write `out`: a seamless Opus loop of length `period` built from `src`.

    `start` (S, from seamfit.find_loop_start) is where the loop is cut from:
    head [S, S+C], middle [S+C, S+P], tail [S+P, S+P+C]. `tilt_db` (D) is the
    end-matching ramp -- gain_dB(t) = (t-S)*D/P applied to the source BEFORE
    trimming (so `t` is source time), lifting the tail onto the head so the
    finished loop's two ends sit at the same level.
    """
    fmt = (f"aformat=sample_fmts=fltp:channel_layouts=stereo:"
           f"sample_rates={sr}")
    pre = f",{loudnorm}" if loudnorm else ""
    if tilt_db:
        # exp() avoids a comma inside the filtergraph expression (pow(10,x)
        # would need escaping); K folds the dB->linear conversion in.
        k = tilt_db * 2.302585092994046 / (20.0 * period)
        tilt = f"volume=exp((t-{start})*{k:.12g}):eval=frame,"
    else:
        tilt = ""
    a, b, c = start, start + C, start + period
    fc = (
        f"[0:a]{tilt}atrim={a}:{b},{fmt},afade=t=in:st=0:d={C},asetpts=PTS-STARTPTS[head];"
        f"[1:a]{tilt}atrim={c}:{c + C},{fmt},afade=t=out:st=0:d={C},asetpts=PTS-STARTPTS[tailf];"
        f"[head][tailf]amix=inputs=2:normalize=0{pre},{fmt}[wrap];"
        f"[2:a]{tilt}atrim={b}:{c},{fmt},asetpts=PTS-STARTPTS[mid];"
        f"[wrap][mid]concat=n=2:v=0:a=1[out]"
    )
    subprocess.check_call(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-i", src, "-i", src, "-i", src,
         "-filter_complex", fc, "-map", "[out]",
         "-ac", "2", "-ar", str(sr), "-c:a", "libopus", "-b:a", OUTPUT_BITRATE, out])


def transcode_to_opus(src, out, sr):
    """Plain format transcode to Opus — no re-loop. For a source that is
    already an exact, seamless, prime-length loop (every shipped MP3 variant
    is): re-trimming it would needlessly re-cut a clean loop, so just convert
    the container/codec."""
    subprocess.check_call(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-i", src, "-ac", "2", "-ar", str(sr),
         "-c:a", "libopus", "-b:a", OUTPUT_BITRATE, out])


def loopify_in_place(path, period):
    """Make `path` a seamless `period`-second Opus loop.

    Returns `(final_path, seam)`. `final_path` is unchanged if `path` was
    already a correct-length `.opus`; a sibling `<stem>.opus` otherwise -- the
    old-extension source is left in place for the *caller* to remove, and only
    after the caller has rewritten and persisted the referencing scene JSON(s),
    so a crash can never strand a JSON pointing at a deleted file. It is None
    if the file was left as-is (already correct length + already Opus, or too
    short to trim). `seam` is the seamfit record for the cut (start, tilt,
    measured wrap step), or None when no cut happened.
    """
    d = probe_duration(path)
    stem, ext = os.path.splitext(path)
    opus_path = stem + ".opus"
    already_opus = ext.lower() == ".opus"
    # NB: plain ASCII in prints -- a fancy arrow here crashed the whole run
    # mid-migration on Windows' default cp1252 console (2026-07-01).
    if abs(d - period) < 2:
        # Already exactly one prime-length loop.
        if already_opus:
            print(f"    skip {os.path.relpath(path, ROOT)} ({d:.1f}s ~= {period})")
            return None, None
        # Non-opus but already the right length (all shipped MP3 variants are
        # exact prime-length seamless loops): a straight transcode migrates it
        # to Opus without re-cutting the loop. This is what makes the
        # documented in-place MP3->Opus migration actually reachable -- the
        # too-short guard below used to fire for every one of these.
        tmp = opus_path + ".tmp.opus"
        transcode_to_opus(path, tmp, OPUS_SR)
        nd = probe_duration(tmp)
        os.replace(tmp, opus_path)
        print(f"    xcode {os.path.relpath(path, ROOT)} -> "
              f"{os.path.relpath(opus_path, ROOT)}: {d:.1f}s -> {nd:.1f}s "
              f"(prime {period}, already looped; migrated to Opus)")
        return opus_path, None
    if d < period + C:
        print(f"    WARN {os.path.relpath(path, ROOT)} too short "
              f"({d:.1f}s < {period + C}) -- left as-is")
        return None, None

    # Where to cut. With slack, search the start offset that level-matches the
    # wrap; without it (dur ~= period + C) there is only one possible cut, S=0.
    fit = seamfit.find_loop_start(path, period)
    tilt, clamped = seamfit.tilt_for(fit, period)
    if clamped:
        print(f"    WARN {os.path.relpath(path, ROOT)} residual seam step "
              f"{fit['postDb'] - fit['preDb']:+.1f} dB exceeds the "
              f"{seamfit.TILT_MAX_DB} dB tilt cap -- clamped to {tilt:+.1f} dB; "
              f"the wrap will still step. Re-cut from a longer source.")
    tmp = opus_path + ".tmp.opus"
    seamless_loop(path, tmp, period, OPUS_SR, start=fit["start"], tilt_db=tilt)
    nd = probe_duration(tmp)
    os.replace(tmp, opus_path)
    # Measure the finished loop rather than trusting the prediction.
    measured = seamfit.wrap_step_db(seamfit.level_envelope(opus_path), period)
    seam = {
        "start": fit["start"], "tiltDb": tilt, "clamped": clamped,
        "searched": fit["searched"], "predictedStepDb": fit["stepDb"],
        "stepAtZeroDb": fit["stepAtZeroDb"],
        "measuredStepDb": measured[0] if measured else None,
    }
    rel = os.path.relpath(opus_path, ROOT)
    src_note = (f"{os.path.relpath(path, ROOT)} -> " if not already_opus else "")
    was = fit["stepAtZeroDb"]
    now = seam["measuredStepDb"]
    print(f"    loop {src_note}{rel}: {d:.1f}s -> {nd:.1f}s (prime {period}) "
          f"start={fit['start']}s tilt={tilt:+.2f}dB wrap step "
          f"{'n/a' if was is None else format(was, '.1f') + 'dB'} at S=0 -> "
          f"{'n/a' if now is None else format(now, '.2f') + 'dB'}"
          + ("" if already_opus else ", migrated to Opus"))
    return opus_path, seam


def update_sidecar(path, period, renamed_from=None, seam=None):
    stem, _ = os.path.splitext(path)
    sc = stem + ".json"
    old_sc = os.path.splitext(renamed_from)[0] + ".json" if renamed_from else sc
    if not os.path.exists(old_sc):
        return
    j = json.load(open(old_sc, encoding="utf-8"))
    j["trimmedTo"] = f"{period}s"
    # The file at this point IS a 48 kHz stereo Opus render — state it
    # outright rather than string-patching whatever stale rate text was there
    # (the old "MP3"->"Opus" swap left "44.1 kHz" claims on 48 kHz files).
    j["outputFormat"] = f"{OPUS_SR // 1000} kHz / {OUTPUT_BITRATE} / stereo Opus"
    note = j.get("notes", "")
    tag = (f" Seamless-looped to {period}s (prime loopOffset) for native "
           f"Howler looping: {C}s fade-wrap of the post-loop tail over the "
           f"head so the loop point is gapless. Encoded as Opus "
           f"({OUTPUT_BITRATE}) — see DECISIONS.md 'Ship scene audio as "
           f"Opus, not MP3'.")
    if "Seamless-looped" not in note:
        j["notes"] = (note + tag).strip()
    if seam is not None:
        # Record WHERE the loop was cut from, without clobbering whatever the
        # capture/leveling pipeline already wrote into `processing`.
        proc = j.get("processing")
        if not isinstance(proc, dict):
            proc = {}
        proc["loopStartSeconds"] = seam["start"]
        proc["loopOffsetSeconds"] = period
        proc["loopStartRationale"] = (
            f"start chosen so the {C}s before the wrap and the {C}s after it "
            f"sit at the same level at P={period}s; trimming from 0 put a "
            f"fade-in against a settled tail" if seam["searched"] else
            f"source has no slack over P={period}s + {C}s wrap; trimmed from 0")
        if seam["tiltDb"]:
            proc["endMatchTiltDb"] = round(seam["tiltDb"], 3)
            proc["endMatchTiltRationale"] = (
                f"residual level step across the wrap after the start "
                f"search; applied "
                f"as a linear-in-dB gain ramp over the {period}s loop so the "
                f"two ends meet at the same level (a few dB across minutes is "
                f"inaudible drift, a step at the wrap is not)")
        j["processing"] = proc
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
            seamless_loop(raw, out, BED_LENGTH, OPUS_SR, start=0)
        finally:
            os.path.exists(raw) and os.remove(raw)
        sc = os.path.splitext(out)[0] + ".json"
        json.dump({
            "source": "Generated (ffmpeg anoisesrc)",
            "license": "Generated synthetic noise — no third-party rights.",
            "outputFormat": f"{OPUS_SR // 1000} kHz / {OUTPUT_BITRATE} / stereo Opus",
            "trimmedTo": f"{BED_LENGTH}s",
            "notes": (f"{color} noise synth-bed carrier, loudnorm I=-23, "
                      f"seamless-looped to {BED_LENGTH}s (prime, coprime to "
                      f"the element offsets). Played by HowlScene as the "
                      f"spectral-glue bed under every scene of this color."),
        }, open(sc, "w", encoding="utf-8"), indent=2)
        print(f"    bed {os.path.relpath(out, ROOT)} "
              f"({probe_duration(out):.1f}s)")


def collect_scene_refs():
    """Map each on-disk audio path to ALL the variants that reference it.

    Loaded across every scene JSON up front, because a file can be shared
    (forest-day's creek is reused by forest-night); it must be processed ONCE
    and its URL rewritten in EVERY referencing scene. Iterating scene by scene
    and rewriting only the current one -- as this once did -- would migrate
    forest-day's creek, delete the .mp3, and leave forest-night 404ing.

    Returns {abs path: [(scene_file, scene_dict, variant, period, element)]}.
    """
    refs = {}
    for f in sorted(glob.glob(os.path.join(SCENES, "*.json"))):
        if f.endswith("index.json"):
            continue
        d = json.load(open(f, encoding="utf-8"))
        for el in d["elements"]:
            period = el["loopOffsetSeconds"]
            for v in el["variants"]:
                path = os.path.normpath(os.path.join(ROOT, "public" + v["url"]))
                refs.setdefault(path, []).append((f, d, v, period, el))
    return refs


def loopify_scenes():
    print("## scene variants")
    refs = collect_scene_refs()

    updated_scene_files = set()
    for path in sorted(refs):
        holders = refs[path]
        period = holders[0][3]
        periods = {h[3] for h in holders}
        if len(periods) > 1:
            # Shared files must agree on their loop period (they're the same
            # bytes). Don't guess — flag it and skip so a mistake is visible.
            print(f"    WARN {os.path.relpath(path, ROOT)} referenced with "
                  f"differing offsets {sorted(periods)} -- skipped")
            continue
        if not os.path.exists(path):
            print(f"    MISSING {os.path.relpath(path, ROOT)}")
            continue
        new_path, seam = loopify_in_place(path, period)
        if new_path is None:
            continue
        if new_path == path:
            # In-place opus re-trim (no rename): sidecar only.
            update_sidecar(new_path, period, seam=seam)
            continue
        # Extension changed (mp3 -> opus). Crash-safe global rewrite: point
        # EVERY referencing scene at the new file and persist each of them
        # BEFORE deleting the old file, so no on-disk scene JSON ever
        # references a path that doesn't exist (S6 ordering, now across
        # scenes). A crash between any two statements still leaves every scene
        # pointing at a present file — the old one until its dump lands, the
        # new .opus after.
        update_sidecar(new_path, period, renamed_from=path, seam=seam)
        new_url = "/" + os.path.relpath(
            new_path, os.path.join(ROOT, "public")).replace(os.sep, "/")
        for (_sf, _sd, variant, _p, _el) in holders:
            variant["url"] = new_url
        for scene_file, scene_dict in {h[0]: h[1] for h in holders}.items():
            json.dump(scene_dict, open(scene_file, "w", encoding="utf-8"), indent=2)
            updated_scene_files.add(scene_file)
        os.remove(path)  # old-extension source, now unreferenced anywhere
    for scene_file in sorted(updated_scene_files):
        print(f"    updated {os.path.relpath(scene_file, ROOT)} (variant URLs -> .opus)")


AUDIT_FLAG_DB = 3.0


def audit_seams():
    """Read-only: measure the wrap level step of every SHIPPED scene variant.

    A shipped file is already exactly P long with the wrap baked into [0, C],
    so the step a sleeper hears at the loop point is the level of the last C
    seconds [P-C, P] against the C seconds just past the wrap [C, 2C]. Files
    over AUDIT_FLAG_DB are flagged as re-cut candidates. Touches nothing.
    """
    refs = collect_scene_refs()
    rows = []
    for path in sorted(refs):
        scene_file, _sd, variant, period, el = refs[path][0]
        scene = os.path.splitext(os.path.basename(scene_file))[0]
        if not os.path.exists(path):
            print(f"    MISSING {os.path.relpath(path, ROOT)}")
            continue
        dur = probe_duration(path)
        env = seamfit.level_envelope(path)
        m = seamfit.wrap_step_db(env, period)
        if m is None:
            print(f"    SKIP {os.path.relpath(path, ROOT)} (too short to measure)")
            continue
        step, tail, post, mean = m
        rows.append({
            "scene": scene, "element": el.get("id", "?"),
            "variant": os.path.basename(path), "period": period,
            "durationSeconds": round(dur, 1), "stepDb": step,
            "tailDb": tail, "postWrapDb": post, "meanDb": mean,
            "tailDevDb": tail - mean, "postWrapDevDb": post - mean,
            "path": path,
        })
    rows.sort(key=lambda r: -r["stepDb"])
    print(f"{'scene':<16} {'element':<22} {'variant':<22} {'P':>4} "
          f"{'step dB':>8} {'mean dB':>8} {'tail dev':>9} {'post dev':>9}  flag")
    for r in rows:
        flag = "FLAG >3dB" if r["stepDb"] > AUDIT_FLAG_DB else ""
        print(f"{r['scene']:<16} {r['element']:<22} {r['variant']:<22} "
              f"{r['period']:>4} {r['stepDb']:>8.2f} {r['meanDb']:>8.1f} "
              f"{r['tailDevDb']:>+9.1f} {r['postWrapDevDb']:>+9.1f}  {flag}")
    over = [r for r in rows if r["stepDb"] > AUDIT_FLAG_DB]
    print("")
    print(f"{len(over)} of {len(rows)} variants over {AUDIT_FLAG_DB} dB.")
    return rows


if __name__ == "__main__":
    if "--audit" in sys.argv:
        audit_seams()
    else:
        gen_beds(force="--force-beds" in sys.argv)
        loopify_scenes()
        print("done.")
