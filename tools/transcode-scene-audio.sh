#!/usr/bin/env bash
# transcode-scene-audio.sh — convert one source file into a web-ready
# scene-audio MP3, with loudness normalization to keep new scenes in
# the same gain ballpark as existing ones.
#
# Why MP3 not OGG: the source dump is OGG/Vorbis at 96–192kHz which
# is overkill for web playback; transcoding to MP3 also gives us the
# format the existing scene files use, so the engine doesn't have to
# handle a second container. Eleven_multilingual_v2 mp3 is the same
# choice used for meditations and stories.
#
# Loudness: single-pass loudnorm at I=-20 LUFS (slightly above the
# -23 broadcast standard — ambient sleep audio sits below dialog and
# needs a bit more presence). TP=-1.0 ceiling avoids inter-sample
# peaks that some browsers clip.
#
# Usage:
#   tools/transcode-scene-audio.sh <input.ogg> <output.mp3>

set -euo pipefail

IN="${1:?usage: transcode-scene-audio.sh <input> <output>}"
OUT="${2:?usage: transcode-scene-audio.sh <input> <output>}"

mkdir -p "$(dirname "$OUT")"

# -ac 2: down-mix anything to stereo if needed (rare in this dump).
# -ar 44100: standard rate — the source is 96/192kHz, useless for
#            web playback, costs cache space and decode CPU.
# -b:a 128k: bitrate that has worked well for the existing scenes.
# -af loudnorm=…: single-pass loudness norm (two-pass is overkill
#                 for ambient material with low loudness range).
ffmpeg -hide_banner -loglevel error -y \
  -i "$IN" \
  -ac 2 \
  -ar 44100 \
  -b:a 128k \
  -af "loudnorm=I=-20:TP=-1.0:LRA=11" \
  "$OUT"

echo "  ✓  $OUT ($(du -k "$OUT" | cut -f1) KB)"
