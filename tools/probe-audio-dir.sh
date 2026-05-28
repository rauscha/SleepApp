#!/usr/bin/env bash
# probe-audio-dir.sh — bulk ffprobe of a directory of audio files.
#
# Reads every audio file under the input directory, extracts a small
# set of metadata fields via ffprobe, and writes a tab-separated
# manifest. Designed for the 585-OGG dump in raw-sounds/new/; lives
# under tools/ because the next round of audio triage will want to
# re-run it as more files come in.
#
# Usage:
#   tools/probe-audio-dir.sh <input-dir> <output-tsv>
#
# Output columns (TSV with header):
#   filename library duration_seconds bit_rate_kbps sample_rate_hz channels codec
#
# - filename: basename without extension
# - library:  everything before the first " - " in the basename
#             (sound-pack naming convention)

set -euo pipefail

IN_DIR="${1:?usage: probe-audio-dir.sh <input-dir> <output-tsv>}"
OUT="${2:?usage: probe-audio-dir.sh <input-dir> <output-tsv>}"

if [[ ! -d "$IN_DIR" ]]; then
  echo "error: input dir not found: $IN_DIR" >&2
  exit 1
fi

# Single-file probe — emits one TSV row to stdout. Designed to be
# called concurrently via xargs -P so we don't sit on 585 sequential
# subprocess spawns.
probe_one() {
  local f="$1"
  local base name lib dur br sr ch codec
  base="$(basename "$f")"
  name="${base%.*}"
  lib="${name%% - *}"

  # -show_format gives duration + bit_rate at the container level;
  # -show_streams gives codec + sample_rate + channels for stream 0.
  # Combined -of json output keeps the shell parsing one-shot.
  local json
  json="$(ffprobe -v error -show_format -show_streams -of json "$f" 2>/dev/null || true)"
  if [[ -z "$json" ]]; then
    # Skip silently — corrupt or unreadable. Listed via the
    # missing-row delta if needed.
    return 0
  fi

  # Pull fields with a tiny python — jq isn't guaranteed on this box.
  python -c "
import json, sys
d = json.loads(sys.stdin.read())
fmt = d.get('format', {})
sm = (d.get('streams') or [{}])[0]
dur = float(fmt.get('duration') or sm.get('duration') or 0)
br = int(int(fmt.get('bit_rate') or sm.get('bit_rate') or 0) / 1000)
sr = int(sm.get('sample_rate') or 0)
ch = int(sm.get('channels') or 0)
codec = sm.get('codec_name') or ''
print(f'{dur:.1f}\t{br}\t{sr}\t{ch}\t{codec}')
" <<< "$json" | while IFS=$'\t' read -r dur br sr ch codec; do
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$name" "$lib" "$dur" "$br" "$sr" "$ch" "$codec"
  done
}

export -f probe_one

# Write header.
printf "filename\tlibrary\tduration_seconds\tbit_rate_kbps\tsample_rate_hz\tchannels\tcodec\n" > "$OUT"

# Find all audio files (broad — ogg/wav/mp3/flac/aiff/m4a) and fan
# out across 8 workers. NUL-separated so spaces/commas in names are
# fine.
find "$IN_DIR" -maxdepth 1 -type f \( \
  -iname '*.ogg' -o \
  -iname '*.wav' -o \
  -iname '*.mp3' -o \
  -iname '*.flac' -o \
  -iname '*.aiff' -o \
  -iname '*.m4a' \
\) -print0 \
| xargs -0 -n1 -P 8 -I{} bash -c 'probe_one "$@"' _ {} \
| sort \
>> "$OUT"

ROW_COUNT=$(($(wc -l < "$OUT") - 1))
echo "Probed $ROW_COUNT files → $OUT"
