# Held-back scenes

A scene in this directory is written, has audio on disk, and is deliberately
not in the catalogue. Nothing globs it: `sceneCatalogue.test.ts` reads
`/public/scenes/*.json`, `tools/loopify-scenes.py` reads `SCENES/*.json`, and
`public/scenes/index.json` is the only thing the app ever loads. Moving a
file in or out of here is the whole mechanism.

This is the "stub it as a comment in index.json" rule from CLAUDE.md, made
real — JSON has no comments, so the note lives in `index.json` under
`_heldBack` and the scene itself lives here.

## singing-bowl (held back 2026-09-16)

The bed is audiocraft MusicGen output that Andrew rejected outright on
2026-06-21, layer by layer: drone-1 "screeching teapot", drone-2 "industrial
ghost music", drone-3 "ghost music", shimmer-1 "wrong character (asian
flutes/pipes)", shimmer-2 "old-school mp3 warble".

It is being replaced, not re-cut — see DECISIONS.md "warm pad/drone is the
default meditation bed" (2026-07-01) — but **there is no source to replace it
from yet.** The 11 real bowl recordings that the superseded 2026-06-21 plan
named are on neither machine. Sourcing is the open task; until then the scene
stays out of the catalogue rather than shipping a screeching teapot.

Its audio is still at `public/audio/singing-bowl/` and its photo and gradient
are still in `src/lib/sceneBackground.ts`, so putting it back is moving one
file and restoring one index entry.

**Known cost while it is held back:** three meditations name `singing-bowl`
as their bed — `body-scan-01`, `breath-01` and `forest-01`. ContentPlayer
already handles a bed id that is not in the index: it warns and plays the
narration with no bed. So those three play bare until the replacement lands.
That is the intended trade — no bed beats a bad one under a voice.
