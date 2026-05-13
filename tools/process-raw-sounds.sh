#!/usr/bin/env bash
# Re-runnable processor for raw-sounds/ -> public/audio/<scene>/<element>/<variant>.mp3
#
# Per file:
#   - skip 5s of head and ~5-15s of tail (avoid recording artefacts)
#   - 3s linear fade-in and fade-out at the new edges (so the file itself
#     doesn't have hard edges fighting FileLayer's equal-power crossfade)
#   - resample to 48 kHz, force stereo (mono sources duplicated to L+R)
#   - EBU R128 single-pass loudnorm -23 LUFS
#   - encode 192 kbps CBR MP3
#
# Per element, optional extra filters (e.g. low-pass for thunder rumble).
#
# Also writes a sidecar JSON next to each output capturing source, license,
# and any quality caveats. Variants flagged with QUALITY_WARN get a
# "to be replaced" note that future-you can grep for.
#
# Re-run safely; outputs are overwritten.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT="$SCRIPT_DIR/.."
RAW="$ROOT/raw-sounds"
OUT="$ROOT/public/audio"
NOW=$(date +%Y-%m-%d)

# Quality warnings to embed in sidecars and surface to future-you.
# Keyed by "scene/element/variant".
declare -A QUALITY_WARN=(
  ["forest-day/creek-trickle/creek-1"]="mono source duplicated to stereo, loses spatial width"
  ["forest-day/distant-birds/birds-2"]="24 kHz / 160 kbps source: birdsong content above 12 kHz lost; mismatches the stereo 48 kHz variant 1"
  ["rain-on-window/rain-on-glass/glass-1"]="mono source duplicated to stereo, loses spatial width"
  ["rain-on-window/rain-on-glass/glass-2"]="24 kHz / 160 kbps source: most-used variant in the most-used scene; upgrade priority"
)

# process <input-filename> <scene> <element> <variant> <duration_s> [extra_audio_filters]
process() {
  local input="$1" scene="$2" element="$3" variant="$4" dur="$5"
  local extra="${6:-}"
  local indir="$RAW/$input"
  local outdir="$OUT/$scene/$element"
  local outmp3="$outdir/$variant.mp3"
  local outjson="$outdir/$variant.json"
  mkdir -p "$outdir"

  local fade_in=3
  local fade_out_start=$(( dur - 3 ))
  local fade_out_dur=3

  # Filter chain: fade in -> [extra] -> fade out -> resample -> loudnorm
  local filter="afade=t=in:st=0:d=${fade_in}${extra},afade=t=out:st=${fade_out_start}:d=${fade_out_dur},aresample=48000,loudnorm=I=-23:LRA=7:TP=-1.5"

  printf '  %s/%s/%s (%ss)\n' "$scene" "$element" "$variant" "$dur"
  ffmpeg -y -ss 5 -t "$dur" -i "$indir" \
    -af "$filter" \
    -ac 2 -ar 48000 -b:a 192k -codec:a libmp3lame \
    -loglevel error \
    "$outmp3"

  # Sidecar — license, attribution, replace-when notes.
  local key="$scene/$element/$variant"
  local notes='Re-encoded from Pixabay source: 5s head trim, 3s fades each end, mono->stereo if needed, loudnorm -23 LUFS, 48 kHz 192 kbps MP3.'
  local warn=""
  if [[ -n "${QUALITY_WARN[$key]+x}" ]]; then
    warn="${QUALITY_WARN[$key]}"
  fi
  if [[ -n "$warn" ]]; then
    cat > "$outjson" <<EOF
{
  "source": "Pixabay",
  "originalFilename": "$input",
  "license": "Pixabay Content License — free, no attribution required, commercial use OK",
  "downloadedAt": "$NOW",
  "trimmedTo": "${dur}s",
  "outputFormat": "48 kHz / 192 kbps / stereo MP3",
  "replaceWhen": "once the rest of the app is built",
  "qualityWarning": "$warn",
  "notes": "$notes"
}
EOF
  else
    cat > "$outjson" <<EOF
{
  "source": "Pixabay",
  "originalFilename": "$input",
  "license": "Pixabay Content License — free, no attribution required, commercial use OK",
  "downloadedAt": "$NOW",
  "trimmedTo": "${dur}s",
  "outputFormat": "48 kHz / 192 kbps / stereo MP3",
  "notes": "$notes"
}
EOF
  fi
}

echo "Processing raw sounds..."

# --- forest-day -----------------------------------------------------------
# loopOffset trio (per scene): 251 / 409 / 521
process "freesound_community-small-brook-water-16811.mp3"            forest-day creek-trickle  creek-1   460
process "freesound_community-poplar_wind-53373.mp3"                  forest-day wind-in-leaves wind-1    590
process "31736081-birds-june-17th-2025-361476.mp3"                   forest-day distant-birds  birds-1   640
process "freesound_community-birds-19624.mp3"                        forest-day distant-birds  birds-2   600

# --- rain-on-window -------------------------------------------------------
process "eryliaa-gentle-rain-on-window-for-sleep-422420.mp3"         rain-on-window rain-on-glass         glass-1    720
process "freesound_community-20100514_rain_1hr-60303.mp3"            rain-on-window rain-on-glass         glass-2    900
process "enternalrainsounds-rain-on-tent-in-forest-421047.mp3"       rain-on-window rain-pavement        pavement-1 720
# Thunder rumbles: low-pass at 600 Hz per the scene's attribution note
# (rumble only, no sharp cracks).
process "freesound_community-cyprus-storm-61421.mp3"                 rain-on-window distant-thunder-rumble rumble-1  640 ",lowpass=f=600"
process "freesound_community-thunder-48580.mp3"                      rain-on-window distant-thunder-rumble rumble-2  600 ",lowpass=f=600"

# --- fireplace ------------------------------------------------------------
# Two elements only — no good room-tone source in the batch (skip the
# dishwasher and trainride files; saved for future scenes).
process "soundreality-fire-crackling-528620.mp3"                                       fireplace fire-close   close-1   575
process "restfuldreamingtunes-sounds-of-nature-fire-in-the-living-room-276290.mp3"     fireplace fire-distant distant-1 600

echo
echo "Done. Outputs in $OUT/"
echo "Skipped (no element fit, saved for later): dishwasher, trainride."
