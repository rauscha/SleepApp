# loop-probe

Measures what a looping `<audio>` layer actually costs at its wrap, in a real
headless Chromium. Run it: `tools/loop-probe/run.sh` (needs ffmpeg and the
Playwright Chromium build; installs nothing).

## Why it exists

`new Howl({ html5: true, loop: true })` does **not** set the `<audio>`
element's native `loop`. Howler runs the loop itself from a JS timer: on
`ended` it calls `stop().play()`, rewinding and restarting the element. That
costs real silence at every wrap — and it happens *after* the gapless wrap
`tools/loopify-scenes.py` bakes into the file, so the crossfade can't help.

Measured 2026-09-11, Chromium 151 headless, 2s Opus loop, 12 wraps:

| mode | silence per wrap | max | element paused | Howler restarts |
|---|---:|---:|---:|---:|
| A  bare `<audio loop>` | 3.8 ms | 8.0 ms | never | n/a |
| B  Howler `loop: true` | **27.0 ms** | 37.2 ms | 17 samples | 12 |
| C  `loop:false` + `node.loop` | 3.6 ms | 4.0 ms | never | 0 |

C is what ships (see `applyNativeLoop` in `src/audio/howl/HowlScene.ts`).
Verified separately against the real `defaultHowlFactory`: native loop on,
zero Howler `end`/`play` events across six wraps, gaps 0.8–3.7 ms, and
`seek()`, `volume()`, `fade()` and `playing()` all still behave.

## Re-run it after any Howler upgrade

C reaches into Howler's private `_sounds` to find the element. An upgrade
that renames internals would silently drop every layer back to B. The code
falls back to Howler's loop on purpose in that case — a tick at each wrap is
bad, a layer that stops dead after one period is far worse — and records a
`howl-native-loop-unavailable` lifecycle event. This probe is how you'd
notice.

## Reading the output

Trust the "silence per wrap" line, which times the element's own
`pause`/`seeking` → `playing` interval. The raw JSON also carries a polled
`deficitSeconds`; ignore it, it shows the same ~90 ms on the bare-element
control that by definition has no gap, so it is measurement artifact.
