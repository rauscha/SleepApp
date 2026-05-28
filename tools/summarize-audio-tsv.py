#!/usr/bin/env python
"""Aggregate the probe-audio-dir.sh TSV into a small markdown summary.

We pull a richer category than probe-audio-dir.sh's "library" field —
that one is the source publisher (e.g. "freetousesounds") which on our
current dump is the same value for all 585 files. The useful grouping
is the *sub-library* (e.g. "Ocean Ambience At Night From Hotel Window"),
which sits between the publisher and the track number in the filename.

Output: markdown to stdout, suitable for piping to a _summary.md file.
"""
from __future__ import annotations

import csv
import re
import statistics as st
import sys
from collections import Counter, defaultdict
from pathlib import Path


# Filename pattern: "<publisher> - <sub-library> - <track-num> <descriptor>"
# We want everything between the first " - " and the next " - <number>".
_SUBLIB_RE = re.compile(r"^[^-]+ - (.+?) - \d+")


def sublib(filename: str) -> str:
    m = _SUBLIB_RE.match(filename)
    return m.group(1).strip() if m else filename


def bucket_duration(seconds: float) -> str:
    if seconds < 30: return "<30s"
    if seconds < 60: return "30–60s"
    if seconds < 180: return "1–3min"
    if seconds < 600: return "3–10min"
    if seconds < 1800: return "10–30min"
    return ">30min"


def bucket_bitrate(kbps: int) -> str:
    if kbps < 96: return "<96kbps"
    if kbps < 192: return "96–192kbps"
    if kbps < 320: return "192–320kbps"
    return ">320kbps"


def main(tsv_path: str) -> None:
    rows = []
    with open(tsv_path, encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            r["duration_seconds"] = float(r["duration_seconds"])
            r["bit_rate_kbps"] = int(r["bit_rate_kbps"])
            r["sample_rate_hz"] = int(r["sample_rate_hz"])
            r["channels"] = int(r["channels"])
            r["sublib"] = sublib(r["filename"])
            rows.append(r)

    n = len(rows)
    total_hours = sum(r["duration_seconds"] for r in rows) / 3600

    print(f"# Audio dump metadata summary")
    print()
    print(f"- **Total files:** {n}")
    print(f"- **Total duration:** {total_hours:.1f} hours")
    print()

    print("## Sub-library breakdown")
    print()
    print("| sub-library | files | total min | min/median/max sec |")
    print("|---|---:|---:|---|")
    by_sub: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        by_sub[r["sublib"]].append(r["duration_seconds"])
    for name, durs in sorted(by_sub.items(), key=lambda kv: -len(kv[1])):
        total_min = sum(durs) / 60
        print(f"| {name} | {len(durs)} | {total_min:.0f} | "
              f"{min(durs):.0f} / {st.median(durs):.0f} / {max(durs):.0f} |")
    print()

    print("## Duration buckets")
    print()
    dur_buckets = Counter(bucket_duration(r["duration_seconds"]) for r in rows)
    for label in ["<30s", "30–60s", "1–3min", "3–10min", "10–30min", ">30min"]:
        print(f"- {label}: **{dur_buckets[label]}**")
    print()

    print("## Sample rate distribution")
    print()
    sr_counts = Counter(r["sample_rate_hz"] for r in rows)
    for sr, c in sorted(sr_counts.items(), key=lambda kv: -kv[1]):
        print(f"- {sr} Hz: **{c}**")
    print()

    print("## Bitrate buckets")
    print()
    br_buckets = Counter(bucket_bitrate(r["bit_rate_kbps"]) for r in rows)
    for label in ["<96kbps", "96–192kbps", "192–320kbps", ">320kbps"]:
        print(f"- {label}: **{br_buckets[label]}**")
    print()

    print("## Channels")
    print()
    ch_counts = Counter(r["channels"] for r in rows)
    for ch, c in sorted(ch_counts.items()):
        label = {1: "mono", 2: "stereo"}.get(ch, f"{ch}-channel")
        print(f"- {label}: **{c}**")
    print()

    too_short = [r for r in rows if r["duration_seconds"] < 60]
    print("## Cull candidates")
    print()
    print(f"- Files under 60s (too short to loop comfortably): **{len(too_short)}**")
    unusual_sr = [r for r in rows if r["sample_rate_hz"] not in (44100, 48000, 96000, 192000)]
    print(f"- Unusual sample rate (not 44.1k / 48k / 96k / 192k): **{len(unusual_sr)}**")
    mono = [r for r in rows if r["channels"] == 1]
    print(f"- Mono (most are stereo): **{len(mono)}**")
    low_br = [r for r in rows if r["bit_rate_kbps"] < 96]
    print(f"- Bitrate < 96kbps: **{len(low_br)}**")
    print()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "_metadata.tsv")
