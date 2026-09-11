#!/usr/bin/env python3
"""Render the loop-probe's raw JSON as a readable table."""
import json
import sys

rows = json.loads(sys.stdin.read().strip())
for r in rows:
    gaps = r.get("transportGapsMs") or []
    mean = sum(gaps) / len(gaps) if gaps else float("nan")
    worst = max(gaps) if gaps else 0.0
    print()
    print(r["label"])
    print(f"   wraps                  {r['wraps']}")
    print(f"   silence per wrap       {mean:.1f} ms (max {worst:.1f})")
    for key in ("pausedSamples", "howlerPlayEvents", "howlerEndEvents",
                "nodeLoopAttribute", "stillPlaying", "fadeWorks"):
        if key in r:
            print(f"   {key:22} {r[key]}")
print("""
The polled deficitSeconds / gapPerWrapMs fields in the raw JSON are a
measurement artifact — they read the same ~90 ms on the bare-element control,
which by definition has no wrap gap. Trust the figure above: it times the
element's own pause/seeking -> playing interval directly.""")
