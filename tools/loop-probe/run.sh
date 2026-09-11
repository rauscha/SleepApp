#!/usr/bin/env bash
# Measure what a looping <audio> layer actually costs at its wrap.
#
# Compares three ways of looping the same file in a real headless Chromium:
#   A  bare <audio loop>                    — the control, the ideal
#   B  Howler html5 loop:true               — what shipped before 2026-09-11
#   C  Howler loop:false + node.loop = true — what ships now
#
# Re-run this after any Howler upgrade: C reaches into Howler's private
# _sounds to find the element, so an upgrade that renames internals would
# silently drop the app back to B's behaviour (see applyNativeLoop, which
# falls back deliberately rather than leaving a layer that stops dead).
#
# Needs ffmpeg and the Playwright Chromium build; no npm packages, no repo
# changes. Node's built-in WebSocket drives Chromium over the DevTools
# protocol.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"
PORT="${LOOP_PROBE_PORT:-8931}"
CDP_PORT="${LOOP_PROBE_CDP_PORT:-9331}"
CHROME="${CHROME_BIN:-$HOME/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome}"

cleanup() {
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  [[ -n "${CHROME_PID:-}" ]] && kill "$CHROME_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

[[ -x "$CHROME" ]] || { echo "No Chromium at $CHROME (set CHROME_BIN)"; exit 1; }

cp "$HERE/index.html" "$HERE/drive.mjs" "$WORK/"
cp "$REPO/node_modules/howler/dist/howler.js" "$WORK/"
# A 2s loop keeps the run short; the wrap behaviour does not depend on length.
ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i "anoisesrc=d=2:c=pink:r=48000:a=0.3" -ac 2 -c:a libopus -b:a 96k \
  "$WORK/loop.opus"

( cd "$WORK" && python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 ) &
SERVER_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" \
  --autoplay-policy=no-user-gesture-required --no-sandbox --disable-gpu \
  --user-data-dir="$WORK/profile" about:blank >"$WORK/chrome.log" 2>&1 &
CHROME_PID=$!
sleep 4

cd "$WORK"
node drive.mjs "http://127.0.0.1:$PORT/index.html" | python3 "$HERE/summarise.py"
