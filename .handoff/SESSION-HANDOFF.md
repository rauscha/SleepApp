# Session hand-off

Rewritten clean at v1.0.0 (2026-10-01). Earlier blocks are at tag
`v1.0.0` (`git show v1.0.0:.handoff/SESSION-HANDOFF.md`).

## State (2026-10-01)

- **v1.0.0 is tagged and live.** `main` is clean and pushed, with a single
  worktree and no stray branches. CACHE_VERSION is **v19**.
- **Green:** `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (294),
  `npm run build`. Two legacy `SceneCoordinator` tests can time out when the
  box is loaded (load average ~8); they pass on a quiet box.
- **Andrew's overnight on v19 was clean,** with the screen allowed to sleep.
- **The catalogue audits clean:** `python3 tools/loopify-scenes.py --audit`
  reports 0 holes and 0 steps over 3 dB. `tools/seam-review.py` flags
  nothing audible in any scene mix.
- **On tikiserv:** prefix tool-shell commands with `source ~/.nvm/nvm.sh`.
  The system Python has numpy, scipy, soundfile and matplotlib (apt).
  `repair-tonal-events.py` needs librosa, which `recut-from-source.py` runs
  through `uv` automatically.

## 2026-10-04
Fixed: the silent first scene (the unlock primer was a no-op; see DECISIONS),
Chrome's fullscreen toast in the installed app, and monsoon's birds (rain-3,
distant-1, distant-2 out; distant-3, distant-4 in, all clean).

## How the catalogue is made now

- **Cut a loop:** `tools/loopify-scenes.py`. The wrap is a real equal-power
  crossfade (fixed 2026-09-30).
- **Re-cut a shipped loop:** `tools/recut-from-source.py`. It reproduces the
  recipe from the source, refuses anything that doesn't match the shipped
  file, and `--shift-search` level-matches a stepped wrap. **Never patch
  shipped audio in place.**
- **Check:** `loopify-scenes.py --audit`, then `seam-review.py [scene]`.
- **New source:** `tools/level-ftus.py --alt-boundary`, then screen it for
  calls (two bands), speech (faster-whisper) and clicks, and have Andrew
  clear every stretch by ear.
- **After a push:** confirm the Pages deploy completed and the live build
  stamp matches before calling anything shipped.

## Next

See `PENDING-DECISIONS.md`. Everything there is optional.
