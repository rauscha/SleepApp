#!/usr/bin/env bash
# build-singing-bowl-scene.sh — turn the raw MusicGen WAVs in
# raw-sounds/singing-bowl-gen/ into the shipped singing-bowl scene under
# public/audio/singing-bowl/.
#
# What this does:
#   - acrossfade-stitches multiple ~75 s MusicGen WAVs into a single longer
#     track that exceeds loopOffsetSeconds + crossfadeSeconds (per the
#     project's incommensurate-loops rule in CLAUDE.md).
#   - Drone element loops @ 251s, so variants need >256s. Three stems available;
#     each variant uses a different 5-stem stitch order so variantRotation
#     'random' gives genuine variety.
#   - Shimmer element loops @ 409s, so variants need >414s. Only two stems
#     available, so we stitch 7 alternating segments (~435s output).
#   - loudnorm I=-23 LUFS for the primary drone (mellow bed), I=-25 LUFS for
#     the supporting shimmer so it sits comfortably under the drone.
#   - mono->stereo upmix (MusicGen output is mono), 44.1 kHz / 128 kbps MP3 —
#     same shipped-format conventions as the other scene MP3s.
#   - Writes a sidecar JSON next to each MP3 with provenance + prompt hint.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT="$SCRIPT_DIR/.."
RAW="$ROOT/raw-sounds/singing-bowl-gen"
OUT="$ROOT/public/audio/singing-bowl"
NOW=$(date +%Y-%m-%d)

# acrossfade duration — 15s triangular curves. Long enough to hide the seam
# between MusicGen stems (which can have noticeably different envelopes at
# their endpoints), short enough that 5 segments of 75s still net >300s.
XFADE=15

LICENSE='Generated locally with Meta audiocraft MusicGen-medium. Weights are CC-BY-NC 4.0 (research/non-commercial), released under audiocraft license. Generated audio is original output; the sidecar records the exact prompt + seed for reproducibility.'

write_sidecar() {
  local out_mp3="$1" stems="$2" prompt_file="$3" trimmed="$4" notes="$5"
  local out_json="${out_mp3%.mp3}.json"
  local prompt_line=""
  if [ -f "$prompt_file" ]; then
    prompt_line=$(grep '^prompt:' "$prompt_file" | sed 's/"/\\"/g' || true)
  fi
  cat > "$out_json" <<EOF
{
  "source": "audiocraft MusicGen-medium (locally generated)",
  "stems": "$stems",
  "license": "$LICENSE",
  "generatedAt": "$NOW",
  "trimmedTo": "$trimmed",
  "outputFormat": "44.1 kHz / 128 kbps / stereo MP3 (upmixed from mono 32 kHz)",
  "notes": "$notes",
  "promptHint": "$prompt_line"
}
EOF
}

# Stitch N mono WAVs into one stereo MP3 via repeated acrossfade.
# Args: <out> <trim_dur> <lufs> <stem_a> <stem_b> [stem_c...]
# Output length = sum(stem durations) - (N-1)*XFADE.
# Build a filter_complex chain dynamically. Each input is prepped to
# mono/44.1k then acrossfade chained pairwise: ((a x b) x c) x d ...
stitch_n() {
  local out="$1" trim_dur="$2" lufs="$3"
  shift 3
  local n=$#
  mkdir -p "$(dirname "$out")"

  local inputs=""
  local filter=""
  local i=0
  for stem in "$@"; do
    inputs+=" -i $stem"
    filter+="[${i}:a]aformat=channel_layouts=mono,aresample=44100[a${i}];"
    i=$((i + 1))
  done

  # Chain acrossfades left-to-right: a0 x a1 -> x1; x1 x a2 -> x2; ...
  filter+="[a0][a1]acrossfade=d=${XFADE}:c1=tri:c2=tri[x1];"
  for ((k = 2; k < n; k++)); do
    local prev=$((k - 1))
    local cur=$k
    if [ "$cur" -eq $((n - 1)) ]; then
      filter+="[x${prev}][a${cur}]acrossfade=d=${XFADE}:c1=tri:c2=tri[joined];"
    else
      filter+="[x${prev}][a${cur}]acrossfade=d=${XFADE}:c1=tri:c2=tri[x${cur}];"
    fi
  done
  # If n == 2, the first acrossfade already produced [x1] but we labelled it
  # so — relabel to [joined] for the final loudnorm step.
  if [ "$n" -eq 2 ]; then
    filter="${filter/\[x1\];/[joined];}"
  fi
  filter+="[joined]aformat=channel_layouts=stereo,loudnorm=I=${lufs}:TP=-1.5:LRA=7[out]"

  ffmpeg -hide_banner -loglevel error -y \
    $inputs \
    -filter_complex "$filter" \
    -map "[out]" -t "$trim_dur" \
    -ac 2 -ar 44100 -b:a 128k \
    "$out"
  printf '  %s (%ss, %d-segment stitch)\n' "$out" "$trim_dur" "$n"
}

echo "=== singing-bowl: bowl-drone (251 s loop, three variants from 5-segment stitches) ==="
# Three drone stems, three variants. Each variant uses a different starting
# stem and a different cyclic stitch order so variantRotation 'random'
# rotates between materially different sounds — not three takes of the
# same arrangement. 5 segments @ 75s with 15s crossfades = 315s output,
# safely above the 256s requirement (251s offset + 5s crossfade).
D1="$RAW/bowl-drone-1.wav"
D2="$RAW/bowl-drone-2.wav"
D3="$RAW/bowl-drone-3.wav"
stitch_n "$OUT/bowl-drone/drone-1.mp3" 300 -23  "$D1" "$D2" "$D3" "$D1" "$D2"
write_sidecar "$OUT/bowl-drone/drone-1.mp3" "1+2+3+1+2 (75s stems)" \
  "$RAW/bowl-drone-1.prompt.txt" "300s" \
  "Five 75s MusicGen-medium drone stems acrossfaded into a 300s loop bed. Cycle starts with drone-1, lets variantRotation 'random' give materially different starts. Exceeds 251s loopOffset + 5s crossfade by ~45s headroom. Mono->stereo upmix, loudnorm I=-23 LUFS, 44.1 kHz 128 kbps stereo MP3."
stitch_n "$OUT/bowl-drone/drone-2.mp3" 300 -23  "$D2" "$D3" "$D1" "$D2" "$D3"
write_sidecar "$OUT/bowl-drone/drone-2.mp3" "2+3+1+2+3 (75s stems)" \
  "$RAW/bowl-drone-2.prompt.txt" "300s" \
  "Same 5-segment stitch pattern as drone-1, cycle starts with drone-2 instead. Different first impression, same long-tail loop properties."
stitch_n "$OUT/bowl-drone/drone-3.mp3" 300 -23  "$D3" "$D1" "$D2" "$D3" "$D1"
write_sidecar "$OUT/bowl-drone/drone-3.mp3" "3+1+2+3+1 (75s stems)" \
  "$RAW/bowl-drone-3.prompt.txt" "300s" \
  "Same 5-segment stitch pattern as drone-1, cycle starts with drone-3 instead."

echo "=== singing-bowl: bowl-shimmer (409 s loop, two variants from 7-segment stitches) ==="
# Only two shimmer stems exist, so each variant alternates A+B+A+B+A+B+A.
# 7 segments @ 75s with 15s crossfades = 435s output, above 414s requirement.
# Variant 2 inverts the alternation (B+A+B+A+B+A+B) so variant rotation
# starts with a different timbre even though the same two source stems
# are involved.
S1="$RAW/bowl-shimmer-1.wav"
S2="$RAW/bowl-shimmer-2.wav"
stitch_n "$OUT/bowl-shimmer/shimmer-1.mp3" 420 -25  "$S1" "$S2" "$S1" "$S2" "$S1" "$S2" "$S1"
write_sidecar "$OUT/bowl-shimmer/shimmer-1.mp3" "1+2+1+2+1+2+1 (75s stems)" \
  "$RAW/bowl-shimmer-1.prompt.txt" "420s" \
  "Seven-segment alternation of two MusicGen shimmer stems into a 420s loop bed. Exceeds 409s loopOffset + 5s crossfade. Quieter LUFS (-25) than the drone (-23) so the shimmer sits comfortably under the primary bowl drone. Mono->stereo upmix, 44.1 kHz 128 kbps stereo MP3."
stitch_n "$OUT/bowl-shimmer/shimmer-2.mp3" 420 -25  "$S2" "$S1" "$S2" "$S1" "$S2" "$S1" "$S2"
write_sidecar "$OUT/bowl-shimmer/shimmer-2.mp3" "2+1+2+1+2+1+2 (75s stems)" \
  "$RAW/bowl-shimmer-2.prompt.txt" "420s" \
  "Same 7-segment alternation as shimmer-1, swapped starting stem so variant rotation begins with a different timbre."

echo
echo "Done. Singing-bowl scene assets built at $OUT."
