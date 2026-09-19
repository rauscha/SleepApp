# Sleep App

> The One Thing: *Put me to sleep and let me stay there.*

A personal sleep PWA for one user: layered ambient soundscapes, narrated sleep
stories, and guided meditations. No accounts, no backend, no telemetry, and
**no generative AI at runtime** — the stories and meditations are audio files
that ship with the build, rendered ahead of time by the scripts in `tools/`.

Currently a v1.0 ship candidate.

## What it does

**Scenes.** Nine layered ambient soundscapes. Each is 2–4 ambient elements
stacked over a quiet noise bed, and each element loops on a *different prime
number of seconds* — 199, 251, 409, 521, 691, 887. Because those are pairwise
coprime, the combined sound only repeats at their least common multiple, which
is tens of hours. This is Brian Eno's *Music for Airports* trick, and it is
the reason a scene does not start sounding like a tape loop ten minutes in.
It is the core design of the app, not an implementation detail.

**Overnight survival.** The thing that makes a sleep app work is still playing
at 4am. Each layer is a plain looping `<audio>` element owned by the OS, the
same primitive Spotify and YouTube use, because anything cleverer gets
suspended when the screen goes off. There is a sleep timer, a Night Drift that
crossfades one scene into another after a set time, and a "3 a.m. Door" — open
the app in the small hours with nothing playing and you get a single near-black
panel offering to put the last scene back on, rather than a bright home screen.

**Library.** Four narrated sleep stories and three guided meditations, each
paired with a scene that plays underneath. Story narration fades down over its
final third so the voice submerges into the bed instead of stopping dead.

**Offline.** A service worker caches the whole catalogue (~430 MB) so the app
opens and plays with no network.

## Design constraints

From the brief, and they are firm:

- No alarm. No notifications, ever. No accounts, no telemetry, no analytics,
  no ads. No tracking, scoring, or "performance" metrics. No onboarding wall.
  No end-of-track sounds.
- Midnight Editorial Minimalism: deep dark ground, warm stone, editorial serif
  headings, a moonlit sage accent. Photography, never illustration. No loud
  wellness iconography.
- Body text at least 16px. Touch targets at least 44×44px.

## Stack

Vite + React + TypeScript, Tailwind, Howler for playback, vitest. No backend.
Deployed to GitHub Pages on every push to `main`.

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run typecheck
npm run build
```

Audio tooling is Python + ffmpeg; see `tools/`.

## Layout

```
src/audio/howl/    the production scene engine (HowlScene, HowlScenePlayer)
src/audio/         shared scene format and types, the volume taper, and a
                   legacy Web Audio engine kept only for the dev harness
src/screens/       Tonight, Player, Library, ContentPlayer, Settings, Door
src/storage/       settings in localStorage; nothing else persists
src/diagnostics/   page-lifecycle log and the debug-marker store
public/scenes/     scene definitions as JSON; index.json is the catalogue
public/audio/      scene variant audio as Opus, with a sidecar per file
                   recording its source, licence and exactly how it was cut
tools/             the audio pipeline, the TTS rig, and the loop prober
```

## Audio provenance

Every shipped audio file has a `.json` sidecar beside it naming its source,
its licence, and the processing that produced it — which loop offset it was
cut to, where in the source the loop starts and why, and what level it was
normalised to. Sources are a purchased Free To Use Sounds bundle (personal build only), free
long-form YouTube releases from named field recordists, Pixabay, two
user-provided recordings, and three synthesized noise beds.
`public/scenes/photos/NOTICES.md` does the same for imagery, where one of the
photographs is Andrew's own.

## Working on it

`CLAUDE.md` is the rulebook — scene authoring, the audio-engine invariants,
and commit discipline. `.handoff/` holds the live state: what is open, what is
blocked, and who it is waiting on. `DECISIONS.md` is the append-only record of
why things are the way they are, and it is worth grepping before changing
anything that involves taste.
