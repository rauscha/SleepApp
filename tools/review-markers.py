#!/usr/bin/env python3
"""Review the debug markers exported from the app.

A marker is the app's answer to "I heard something wrong at 2am" — it
records, at the instant of the tap, which scene was playing, which variant
file every layer had picked, and where inside its loop each one was. This
reads that export back and turns it into the three things worth knowing at
the desk:

  1. Which layers were at a loop wrap when you tapped (the usual suspect).
  2. How bad each of those files' wraps actually measure (--measure).
  3. What it sounded like — re-render the exact moment (--render).

Usage
-----
    python tools/review-markers.py sleep-markers-....json
    python tools/review-markers.py markers.json --measure
    python tools/review-markers.py markers.json --render
    python tools/review-markers.py markers.json --wraps

Get the JSON from Settings -> Diagnostics -> Debug markers -> Download JSON.

stdlib + ffmpeg only, like the rest of tools/.
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seamfit  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
RENDER_DIR = os.path.join(ROOT, "notes", "marker-renders")

# Seconds either side of the tap to re-render. A tap lags the sound that
# prompted it, so the window leans backwards.
RENDER_BEFORE = 25.0
RENDER_AFTER = 10.0
# Matches SEAM_WINDOW_SECONDS in src/diagnostics/markers.ts.
DEFAULT_SEAM_WINDOW = 10.0
# Matches AUDIT_FLAG_DB in tools/loopify-scenes.py.
FLAG_DB = 3.0


def local_path(url):
    """Map a marker's layer url onto the file on disk."""
    clean = url.split("?")[0].split("#")[0]
    # Urls are served from public/ and may carry a base path (GitHub Pages).
    idx = clean.find("/audio/")
    if idx == -1:
        return None
    return os.path.join(PUBLIC, clean[idx + 1:])


def wrap_distance(seek, period):
    if seek is None or not period:
        return None
    pos = seek % period
    return min(pos, period - pos)


def is_seam_suspect(marker, layer, window):
    """Mirror of isSeamSuspect() in src/diagnostics/markers.ts — a position
    near zero is the file's start, not a wrap, until the layer has been
    round at least once."""
    d = wrap_distance(layer.get("seekSeconds"), layer.get("periodSeconds"))
    if d is None or d > window:
        return False
    pos = layer["seekSeconds"] % layer["periodSeconds"]
    if pos <= window and marker.get("elapsedMs", 0) / 1000.0 < layer["periodSeconds"]:
        return False
    return True


def fmt_clock(ms):
    total = max(0, int(ms // 1000))
    h, m, s = total // 3600, (total % 3600) // 60, total % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def load(path):
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, list):  # tolerate a bare array
        return {"markers": data, "seamWindowSeconds": DEFAULT_SEAM_WINDOW}
    return data


# ---------------------------------------------------------------------------


def report(payload, window, measure=False):
    markers = payload.get("markers", [])
    print(f"{len(markers)} marker(s)")
    if payload.get("build"):
        print(f"build {payload['build']}")
    if payload.get("device"):
        print(f"device {payload['device'][:90]}")
    print()

    steps = measure_files(markers) if measure else {}

    for i, m in enumerate(markers, 1):
        when = datetime.fromtimestamp(m["ts"] / 1000).strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{i}] {when}  {m.get('sceneLabel', m['sceneId'])}  "
              f"+{fmt_clock(m.get('elapsedMs', 0))} into the scene  "
              f"[{m.get('trigger', '?')}]")
        if m.get("note"):
            print(f"    note: {m['note']}")
        print(f"    master {round(m.get('masterVolume', 0) * 100)}%  "
              f"timer {m.get('timerStatus', '?')}")

        for layer in m.get("layers", []):
            d = wrap_distance(layer.get("seekSeconds"), layer.get("periodSeconds"))
            suspect = is_seam_suspect(m, layer, window)
            seek = layer.get("seekSeconds")
            pos = "     ?" if seek is None else f"{seek:6.1f}"
            wrap = "" if d is None else (
                f"  ** {d:.1f}s FROM WRAP **" if suspect else f"  ({d:.0f}s from wrap)"
            )
            flag = ""
            path = local_path(layer.get("url", ""))
            if path and path in steps:
                step = steps[path]
                flag = f"  [wrap step {step:.2f} dB{' FLAG' if step > FLAG_DB else ''}]"
            playing = "" if layer.get("playing", True) else "  [NOT PLAYING]"
            print(f"    {layer.get('label', '?'):<18} {pos}s /"
                  f"{layer.get('periodSeconds', 0):>4}s  "
                  f"vol {layer.get('volume', 0):.2f}{playing}{wrap}{flag}")
            print(f"    {'':<18} {layer.get('url', '')}")

        if m.get("recentEvents"):
            print(f"    events: {' | '.join(m['recentEvents'])}")
        print()

    summarise(markers, window)


def summarise(markers, window):
    counts = {}
    for m in markers:
        for layer in m.get("layers", []):
            if is_seam_suspect(m, layer, window):
                counts[layer.get("url", "?")] = counts.get(layer.get("url", "?"), 0) + 1
    if not counts:
        print("No layer was near its loop wrap at any marker.")
        print("That points away from a seam — look at the mix, a stacked "
              "element, or the source material itself.")
        return
    print("Layers at a wrap, most often first:")
    for url, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {n:>3}x  {url}")


def measure_files(markers):
    """Measure the real wrap step of every distinct file in the markers."""
    steps = {}
    seen = {}
    for m in markers:
        for layer in m.get("layers", []):
            path = local_path(layer.get("url", ""))
            period = layer.get("periodSeconds")
            if path and period and path not in seen:
                seen[path] = period
    for path, period in seen.items():
        if not os.path.exists(path):
            print(f"    (missing on disk: {os.path.relpath(path, ROOT)})")
            continue
        env = seamfit.level_envelope(path)
        measured = seamfit.wrap_step_db(env, period)
        if measured:
            steps[path] = measured[0]
    return steps


# ---------------------------------------------------------------------------


def wraps(payload, count=4):
    """Back-compute when each layer wrapped around the marker."""
    for i, m in enumerate(payload.get("markers", []), 1):
        print(f"[{i}] {datetime.fromtimestamp(m['ts'] / 1000):%H:%M:%S}  "
              f"{m.get('sceneLabel', m['sceneId'])}")
        for layer in m.get("layers", []):
            seek, period = layer.get("seekSeconds"), layer.get("periodSeconds")
            if seek is None or not period:
                continue
            pos = seek % period
            print(f"    {layer.get('label', '?'):<18} every {period}s; "
                  f"last wrap {pos:.0f}s before the mark, "
                  f"next {period - pos:.0f}s after")
            offsets = []
            for k in range(-count, count + 1):
                offsets.append(k * period - pos)
            marks = ", ".join(
                f"{'+' if o >= 0 else ''}{o / 60:.1f}m" for o in offsets if abs(o) > 1
            )
            print(f"    {'':<18} relative to the mark: {marks}")
        print()


# ---------------------------------------------------------------------------


def render(payload, window, only=None):
    os.makedirs(RENDER_DIR, exist_ok=True)
    markers = payload.get("markers", [])
    for i, m in enumerate(markers, 1):
        if only and i not in only:
            continue
        out = os.path.join(
            RENDER_DIR,
            f"marker-{i:02d}-{datetime.fromtimestamp(m['ts'] / 1000):%Y%m%d-%H%M%S}"
            f"-{m['sceneId']}.wav",
        )
        inputs, filters, labels = [], [], []
        for n, layer in enumerate(m.get("layers", [])):
            path = local_path(layer.get("url", ""))
            seek, period = layer.get("seekSeconds"), layer.get("periodSeconds")
            if not path or not os.path.exists(path) or seek is None or not period:
                continue
            gain = layer.get("volume", 1.0) * layer.get("outer", 1.0)
            if gain <= 0:
                continue
            start = (seek - RENDER_BEFORE) % period
            dur = RENDER_BEFORE + RENDER_AFTER
            # Loop the input so a window straddling the wrap renders the wrap
            # itself — which is the entire point when a seam is suspected.
            inputs += ["-stream_loop", "-1", "-ss", f"{start:.3f}",
                       "-t", f"{dur:.3f}", "-i", path]
            filters.append(f"[{len(labels)}:a]volume={gain:.4f}[a{n}]")
            labels.append(f"[a{n}]")
        if not labels:
            print(f"[{i}] nothing renderable (files missing?) — skipped")
            continue
        filters.append(
            f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0[out]"
        )
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"] + inputs + [
            "-filter_complex", ";".join(filters), "-map", "[out]",
            "-ac", "2", "-ar", "48000", out,
        ]
        subprocess.run(cmd, check=True)
        suspects = [l.get("label") for l in m.get("layers", [])
                    if is_seam_suspect(m, l, window)]
        note = f"  (at wrap: {', '.join(suspects)})" if suspects else ""
        print(f"[{i}] {os.path.relpath(out, ROOT)}{note}")
    print()
    print(f"{RENDER_BEFORE:.0f}s before the mark to {RENDER_AFTER:.0f}s after, "
          "each layer at the level it was actually playing at.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export", help="markers JSON from Settings -> Diagnostics")
    ap.add_argument("--measure", action="store_true",
                    help="measure each file's real wrap step with ffmpeg (slower)")
    ap.add_argument("--render", action="store_true",
                    help=f"re-render each marked moment into {os.path.relpath(RENDER_DIR, ROOT)}")
    ap.add_argument("--wraps", action="store_true",
                    help="back-compute each layer's wrap times around the mark")
    ap.add_argument("--only", type=int, nargs="*", metavar="N",
                    help="limit --render to these marker numbers")
    ap.add_argument("--seam-window", type=float, default=None,
                    help=f"seconds either side of a wrap to flag (default {DEFAULT_SEAM_WINDOW})")
    args = ap.parse_args()

    payload = load(args.export)
    window = args.seam_window or payload.get("seamWindowSeconds") or DEFAULT_SEAM_WINDOW

    if args.wraps:
        wraps(payload)
    elif args.render:
        render(payload, window, set(args.only or []))
    else:
        report(payload, window, measure=args.measure)


if __name__ == "__main__":
    main()
