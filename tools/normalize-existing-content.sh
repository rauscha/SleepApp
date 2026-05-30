#!/usr/bin/env bash
# normalize-existing-content.sh — apply the voice-content loudnorm pass
# to meditation + story MP3s that were generated before the loudnorm
# step landed in gen-meditation.ts / gen-story.ts.
#
# Same target as the gen scripts: I=-19 LUFS, TP=-1.0, LRA=7. Single-
# pass loudnorm with linear=true. See tools/normalize-voice-audio.ts for
# the rationale on those numbers.
#
# Idempotent: re-running on a file that has already been normalized
# nudges it by <1 dB and leaves a backup, so it's safe.
#
# Each input is processed in place:
#   <name>.mp3       → moved to <name>.pre-loudnorm.mp3 (backup, gitignored)
#   <name>.mp3 (new) → loudnorm output
#
# The .pre-loudnorm.mp3 backups are gitignored via the pattern below; this
# script adds the pattern to .gitignore the first time it runs if it's
# not already there.
#
# Usage:
#   tools/normalize-existing-content.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_LOUDNORM='I=-19:TP=-1.0:LRA=7'

# Add the backup pattern to .gitignore on first run (so the user doesn't
# accidentally commit double-size MP3s).
GITIGNORE="$REPO_ROOT/.gitignore"
if [[ -f "$GITIGNORE" ]] && ! grep -qxF '*.pre-loudnorm.mp3' "$GITIGNORE"; then
  printf '\n# loudnorm backups created by tools/normalize-existing-content.sh\n*.pre-loudnorm.mp3\n' >> "$GITIGNORE"
  echo "  • Added *.pre-loudnorm.mp3 to .gitignore"
fi

normalize_one() {
  local in_path="$1"
  local backup="${in_path%.mp3}.pre-loudnorm.mp3"
  local tmp="${in_path%.mp3}.tmp.mp3"

  if [[ ! -f "$in_path" ]]; then
    echo "  ⚠  Skipping (not found): $in_path"
    return 0
  fi
  if [[ -f "$backup" ]]; then
    echo "  • $in_path already has a backup at $backup — skipping (delete the backup to re-normalize)"
    return 0
  fi

  echo "  ⟳  $in_path"

  # Match the gen-scripts' output: 44.1 kHz mono 128 kbps MP3 with
  # linear-mode loudnorm to the agreed -19 LUFS target.
  ffmpeg -hide_banner -loglevel error -y \
    -i "$in_path" \
    -af "loudnorm=${TARGET_LOUDNORM}:linear=true" \
    -c:a libmp3lame -b:a 128k -ar 44100 -ac 1 \
    "$tmp"

  mv "$in_path" "$backup"
  mv "$tmp" "$in_path"
  echo "  ✓  $in_path (backup at $backup)"
}

shopt -s nullglob
files=("$REPO_ROOT"/public/meditations/*.mp3 "$REPO_ROOT"/public/stories/*.mp3)
shopt -u nullglob

# Skip any .pre-loudnorm.mp3 files that might already exist (defensive).
for f in "${files[@]}"; do
  case "$f" in
    *.pre-loudnorm.mp3) continue ;;
  esac
  normalize_one "$f"
done

echo
echo "Done. Backups left at *.pre-loudnorm.mp3 (gitignored). After"
echo "auditioning the normalized files, delete the backups:"
echo "  rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3"
