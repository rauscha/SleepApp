#!/usr/bin/env bash
# grow-out-scenes.sh — one-off builder that takes the three sparse 2026-05-28
# scenes (ocean-night, monsoon, forest-evening) from "synth + one file" up to
# the multi-element layered design every other scene uses.
#
# Why not transcode-scene-audio.sh:
#   - Three of the new variants need ffmpeg filter graphs beyond the basic
#     resample / loudnorm pipeline:
#       * acrossfade-extending the existing 183 s Korea-hotel waves OGGs into
#         one ~290 s file each, so loopOffset can sit on a real prime (251)
#         rather than the off-list 175 used in the WIP scene.
#       * silence-padding short Busan dockside / monsoon thunder events into
#         long sparse tracks (~560 s) — these layers want occasional events,
#         not constant texture.
#       * a 600 Hz low-pass on the thunder rumble — matches the rain-on-window
#         convention so we get distant rumble without sharp cracks.
#   - Loudnorm I=-20 LUFS / TP=-1.0 / 44.1 kHz / 128 kbps stereo MP3 — same
#     ballpark as the original transcode-scene-audio.sh, so volumes stay in
#     the same gain neighborhood as the 2026-05-28 sources.
#
# Re-run safely; outputs are overwritten. Sidecar JSONs are written next to
# each MP3 the same way transcode-scene-audio.sh would have written them.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT="$SCRIPT_DIR/.."
RAW="$ROOT/raw-sounds/new"
OUT="$ROOT/public/audio"
NOW=$(date +%Y-%m-%d)

LICENSE='Free To Use Sounds paid library — derivative works permitted (including commercial), no attribution required. Original sounds may not be redistributed in their original form; the shipped MP3 is a derivative (transcoded + loudnorm-normalized). See https://freetousesounds.com/license-agreement'

# write_sidecar <out.mp3> <scene/element/variant> <originalFilename> <trimmedTo> <notes>
write_sidecar() {
  local out_mp3="$1" key="$2" original="$3" trimmed="$4" notes="$5"
  local out_json="${out_mp3%.mp3}.json"
  cat > "$out_json" <<EOF
{
  "source": "freetousesounds sound library",
  "originalFilename": "$original",
  "license": "$LICENSE",
  "downloadedAt": "$NOW",
  "trimmedTo": "$trimmed",
  "outputFormat": "44.1 kHz / 128 kbps / stereo MP3",
  "notes": "$notes"
}
EOF
}

# resample, loudnorm, trim — basic pipeline, single OGG in.
basic_transcode() {
  local input="$1" output="$2" dur="$3"
  mkdir -p "$(dirname "$output")"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$input" -t "$dur" \
    -af "aresample=44100,loudnorm=I=-20:TP=-1.0:LRA=11" \
    -ac 2 -ar 44100 -b:a 128k \
    "$output"
  printf '  %s (%ss)\n' "$output" "$dur"
}

# acrossfade two OGGs into one long file, then trim/loudnorm.
# Used to extend the 183 s Korea-hotel waves into ~290 s variants.
crossfade_extend() {
  local in_a="$1" in_b="$2" output="$3" trim_dur="$4"
  mkdir -p "$(dirname "$output")"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$in_a" -i "$in_b" \
    -filter_complex "[0:a]aresample=44100,aformat=channel_layouts=stereo[a];[1:a]aresample=44100,aformat=channel_layouts=stereo[b];[a][b]acrossfade=d=20:c1=tri:c2=tri[x];[x]loudnorm=I=-20:TP=-1.0:LRA=11[out]" \
    -map "[out]" -t "$trim_dur" \
    -ac 2 -ar 44100 -b:a 128k \
    "$output"
  printf '  %s (%ss, crossfade-extended)\n' "$output" "$trim_dur"
}

# Single short event padded into a long mostly-silent track.
# leading_silence + clip + trailing silence = total_dur. For the dockside
# layer where we want one ~3 min event then ~6 min silence.
pad_single_event() {
  local input="$1" output="$2" lead="$3" total="$4"
  mkdir -p "$(dirname "$output")"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$input" \
    -af "adelay=${lead}000|${lead}000,apad=whole_dur=${total},aresample=44100,loudnorm=I=-20:TP=-1.0:LRA=11" \
    -ac 2 -ar 44100 -b:a 128k -t "$total" \
    "$output"
  printf '  %s (%ss, single event at %ss)\n' "$output" "$total" "$lead"
}

# Two events stitched into a long sparse track with a 600 Hz low-pass.
# Used for the monsoon distant-thunder rumble: occasional muffled events,
# no sharp cracks. Positions are picked so the events sit well inside the
# 521 s loop window.
stitch_two_events_lowpass() {
  local in_a="$1" pos_a="$2" in_b="$3" pos_b="$4" output="$5" total="$6"
  mkdir -p "$(dirname "$output")"
  # Get exact event durations so the silence segments add up cleanly.
  local dur_a dur_b
  dur_a=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in_a")
  dur_b=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in_b")
  local sil1 sil2 sil3
  sil1="$pos_a"
  sil2=$(awk -v p="$pos_b" -v s="$pos_a" -v d="$dur_a" 'BEGIN{printf "%.3f", p-s-d}')
  sil3=$(awk -v t="$total" -v p="$pos_b" -v d="$dur_b" 'BEGIN{printf "%.3f", t-p-d}')

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" \
    -i "$in_a" \
    -i "$in_b" \
    -filter_complex "
      [0]atrim=0:${sil1},asetpts=PTS-STARTPTS[s1];
      [1]aresample=44100,aformat=channel_layouts=stereo[t1];
      [0]atrim=0:${sil2},asetpts=PTS-STARTPTS[s2];
      [2]aresample=44100,aformat=channel_layouts=stereo[t2];
      [0]atrim=0:${sil3},asetpts=PTS-STARTPTS[s3];
      [s1][t1][s2][t2][s3]concat=n=5:v=0:a=1[joined];
      [joined]lowpass=f=600,loudnorm=I=-23:TP=-1.5:LRA=7[out]
    " \
    -map "[out]" \
    -ac 2 -ar 44100 -b:a 128k -t "$total" \
    "$output"
  printf '  %s (%ss, 2 events @ %ss/%ss, low-passed)\n' "$output" "$total" "$pos_a" "$pos_b"
}

echo "=== ocean-night: waves (rebuild from acrossfade of adjacent Korea-hotel OGGs) ==="
korea_ogg() { ls "$RAW/"*"Ocean Ambience At Night From Hotel Windo - $1 "*.ogg | head -1; }
KOREA_01=$(korea_ogg 01); KOREA_02=$(korea_ogg 02)
KOREA_03=$(korea_ogg 03); KOREA_04=$(korea_ogg 04)
KOREA_05=$(korea_ogg 05); KOREA_06=$(korea_ogg 06)
crossfade_extend "$KOREA_01" "$KOREA_02" \
                 "$OUT/ocean-night/waves/wave-1.mp3" 290
write_sidecar "$OUT/ocean-night/waves/wave-1.mp3" "ocean-night/waves/wave-1" \
  "Ocean Ambience At Night From Hotel Windo - 01 + 02 (Korea, coastal town hotel window).ogg" \
  "290s (acrossfade of 01+02)" \
  "Two adjacent 183s Korea-hotel-window OGGs acrossfaded into one ~290s constant-roar variant so loopOffset can sit on prime 251 rather than the off-list 175. Acrossfade duration 20s, triangular curves. Loudnorm I=-20 LUFS, 44.1 kHz 128 kbps stereo MP3."
crossfade_extend "$KOREA_03" "$KOREA_04" \
                 "$OUT/ocean-night/waves/wave-2.mp3" 290
write_sidecar "$OUT/ocean-night/waves/wave-2.mp3" "ocean-night/waves/wave-2" \
  "Ocean Ambience At Night From Hotel Windo - 03 + 04 (Korea, coastal town hotel window).ogg" \
  "290s (acrossfade of 03+04)" \
  "Two adjacent 183s Korea-hotel-window OGGs acrossfaded into one ~290s constant-roar variant so loopOffset can sit on prime 251. Same pipeline as wave-1."
crossfade_extend "$KOREA_05" "$KOREA_06" \
                 "$OUT/ocean-night/waves/wave-3.mp3" 295
write_sidecar "$OUT/ocean-night/waves/wave-3.mp3" "ocean-night/waves/wave-3" \
  "Ocean Ambience At Night From Hotel Windo - 05 + 06 (Korea, coastal town hotel window).ogg" \
  "295s (acrossfade of 05+06)" \
  "Two adjacent 183s Korea-hotel-window OGGs acrossfaded into one ~295s constant-roar variant so loopOffset can sit on prime 251. Same pipeline as wave-1."

echo "=== ocean-night: waves-far (Sri Lanka crashing surf, longer perspective) ==="
# Sri Lanka files 06 and 07 are the two longest (~600 s each), giving plenty
# of headroom over the 409 s loop offset. Files 12 / 14 (308 / 369 s) were
# the first pick but came up short — anything used as a loop bed must be
# longer than loopOffsetSeconds + crossfadeSeconds.
SRI_06=$(ls "$RAW/"*"Royalty Free Ocean Sounds Sri Lanka - 06 "*.ogg | head -1)
SRI_07=$(ls "$RAW/"*"Royalty Free Ocean Sounds Sri Lanka - 07 "*.ogg | head -1)
basic_transcode "$SRI_06" "$OUT/ocean-night/waves-far/far-1.mp3" 450
write_sidecar "$OUT/ocean-night/waves-far/far-1.mp3" "ocean-night/waves-far/far-1" \
  "$(basename "$SRI_06")" "450s" \
  "Sri Lanka east coast crashing surf — second wave layer at a different perspective from the primary Korea-hotel waves. Loudnorm I=-20 LUFS, 44.1 kHz 128 kbps stereo MP3."
basic_transcode "$SRI_07" "$OUT/ocean-night/waves-far/far-2.mp3" 460
write_sidecar "$OUT/ocean-night/waves-far/far-2.mp3" "ocean-night/waves-far/far-2" \
  "$(basename "$SRI_07")" "460s" \
  "Sri Lanka east coast crashing surf — second wave layer variant. Same pipeline as far-1."

echo "=== ocean-night: dockside-distant (Busan harbor, sparse events) ==="
BUS_25=$(ls "$RAW/"*"Haunting Dockside Nautical Ambience Busa - 25 "*.ogg | head -1)
BUS_27=$(ls "$RAW/"*"Haunting Dockside Nautical Ambience Busa - 27 "*.ogg | head -1)
pad_single_event "$BUS_25" "$OUT/ocean-night/dockside-distant/dock-1.mp3" 30 555
write_sidecar "$OUT/ocean-night/dockside-distant/dock-1.mp3" "ocean-night/dockside-distant/dock-1" \
  "$(basename "$BUS_25")" "555s (184s clip + silence)" \
  "Distant Busan harbor nautical ambience as a sparse event layer. 30s lead silence, 184s of clip, then trailing silence to 555s total — one dockside event per ~9-min loop. Loudnorm I=-20 LUFS, 44.1 kHz 128 kbps stereo MP3."
pad_single_event "$BUS_27" "$OUT/ocean-night/dockside-distant/dock-2.mp3" 60 555
write_sidecar "$OUT/ocean-night/dockside-distant/dock-2.mp3" "ocean-night/dockside-distant/dock-2" \
  "$(basename "$BUS_27")" "555s (155s clip + silence)" \
  "Second sparse dockside variant. 60s lead silence, 155s clip, trailing silence to 555s."

echo "=== monsoon: rain-distant (Rooftop Tent — wind+rain on canvas) ==="
TENT_02=$(ls "$RAW/"*"Rooftop Tent Wind And Rain Sound Library - 02 "*.ogg | head -1)
TENT_06=$(ls "$RAW/"*"Rooftop Tent Wind And Rain Sound Library - 06 "*.ogg | head -1)
basic_transcode "$TENT_02" "$OUT/monsoon/rain-distant/distant-1.mp3" 430
write_sidecar "$OUT/monsoon/rain-distant/distant-1.mp3" "monsoon/rain-distant/distant-1" \
  "$(basename "$TENT_02")" "430s" \
  "Australian rooftop-tent wind+rain — second rain layer with a softer canvas surface vs the primary garage-roof metal. Loudnorm I=-20 LUFS, 44.1 kHz 128 kbps stereo MP3."
basic_transcode "$TENT_06" "$OUT/monsoon/rain-distant/distant-2.mp3" 440
write_sidecar "$OUT/monsoon/rain-distant/distant-2.mp3" "monsoon/rain-distant/distant-2" \
  "$(basename "$TENT_06")" "440s" \
  "Rooftop-tent wind+rain variant. Same pipeline as distant-1."

echo "=== monsoon: thunder-rumble (Muffled Thunder, low-passed at 600 Hz) ==="
THU_34=$(ls "$RAW/"*"Muffled Thunder Sounds Behind Closed Doo - 34 "*.ogg | head -1)
THU_06=$(ls "$RAW/"*"Muffled Thunder Sounds Behind Closed Doo - 06 "*.ogg | head -1)
THU_03=$(ls "$RAW/"*"Muffled Thunder Sounds Behind Closed Doo - 03 "*.ogg | head -1)
THU_31=$(ls "$RAW/"*"Muffled Thunder Sounds Behind Closed Doo - 31 "*.ogg | head -1)
stitch_two_events_lowpass "$THU_34" 60 "$THU_06" 320 "$OUT/monsoon/thunder-rumble/rumble-1.mp3" 560
write_sidecar "$OUT/monsoon/thunder-rumble/rumble-1.mp3" "monsoon/thunder-rumble/rumble-1" \
  "Muffled Thunder Sounds Behind Closed Door - 34 + 06.ogg" \
  "560s (events at 60s + 320s + silence)" \
  "Two muffled thunder events from the Indonesia behind-closed-door library, positioned 60s and 320s into a 560s mostly-silent track. 600 Hz low-pass per the rain-on-window convention — rumble only, no sharp cracks. Loudnorm I=-23 LUFS, 44.1 kHz 128 kbps stereo MP3."
stitch_two_events_lowpass "$THU_03" 90 "$THU_31" 380 "$OUT/monsoon/thunder-rumble/rumble-2.mp3" 560
write_sidecar "$OUT/monsoon/thunder-rumble/rumble-2.mp3" "monsoon/thunder-rumble/rumble-2" \
  "Muffled Thunder Sounds Behind Closed Door - 03 + 31.ogg" \
  "560s (events at 90s + 380s + silence)" \
  "Second rumble variant — events at 90s and 380s. Same pipeline as rumble-1."

echo "=== forest-evening: creek-trickle (acrossfade-extend forest-day creek MP3s) ==="
# The existing forest-day creek MP3s (460 s and 540 s) are shorter than the
# 691 s loop offset forest-evening wants for its fourth element. Acrossfade-
# extend them into ~750 s variants so the prime-list offset holds. We're
# re-encoding MP3 → MP3 here (minor quality cost) because the originals are
# all we have; if higher quality is ever needed, re-transcode from the
# original Pixabay / user-provided WAVs.
FD_CREEK_1="$OUT/forest-day/creek-trickle/creek-1.mp3"
FD_CREEK_2="$OUT/forest-day/creek-trickle/creek-2.mp3"
crossfade_extend "$FD_CREEK_1" "$FD_CREEK_2" \
                 "$OUT/forest-evening/creek-trickle/creek-1.mp3" 750
write_sidecar "$OUT/forest-evening/creek-trickle/creek-1.mp3" "forest-evening/creek-trickle/creek-1" \
  "forest-day/creek-trickle/creek-1.mp3 + creek-2.mp3 (acrossfade)" \
  "750s (acrossfade of two forest-day creek MP3s)" \
  "Two forest-day creek MP3s (460s + 540s, Pixabay + user-provided) acrossfaded into one ~750s creek-trickle variant so loopOffset 691 holds. 20s triangular crossfade. Loudnorm I=-20 LUFS, 44.1 kHz 128 kbps stereo MP3."
crossfade_extend "$FD_CREEK_2" "$FD_CREEK_1" \
                 "$OUT/forest-evening/creek-trickle/creek-2.mp3" 750
write_sidecar "$OUT/forest-evening/creek-trickle/creek-2.mp3" "forest-evening/creek-trickle/creek-2" \
  "forest-day/creek-trickle/creek-2.mp3 + creek-1.mp3 (acrossfade, reverse order)" \
  "750s (acrossfade of two forest-day creek MP3s, swapped order)" \
  "Reverse-order acrossfade of the same two forest-day creek MP3s, giving a different entry point within the 691 s loop window so variant rotation gives real variety. Same pipeline as creek-1."

echo
echo "Done."
