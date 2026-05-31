# Session hand-off — 2026-05-31 afternoon (machine: desktop)

## STATE (read this first)
- Branch: `main`, synced with `origin/main` at `52ec0cc`. Ahead/behind 0/0.
- Working tree effectively clean: the only tracked "change" is a
  stat-dirty `.handoff/PENDING-DECISIONS.md` (Google Drive touched it; the
  content diff is literally 0 lines). Untracked files are all personal /
  non-project (mkcert .pem certs, .gdoc pointers, go.js/vbs, reviews/).
- Tests 116/116 green; `npm run typecheck` clean.
- **3 commits this session, all pushed.** CACHE_VERSION already at v7 (from
  the singing-bowl commit); NOT bumped again — see "Watch out for".

## Done this session
- **Pushed the singing-bowl meditation bed (`b766f8b`).** An earlier
  unattended run had committed it locally but never pushed — it was sitting
  only on this machine + Drive. Now safe on origin. (Two ambient layers on
  prime offsets 251/409 over a brown synth bed; meditations now play over
  it with `bedBehavior='stop-with-content'`.)
- **Fixed story generation dying when the phone screen sleeps (`52ec0cc`)**
  — the headline bug this session. Three compounding causes:
    1. No wake lock on StoryGeneratorScreen → screen slept → tab suspended
       → in-flight fetch killed. Added `useWakeLock(busy)`.
    2. No timeout on the Claude/ElevenLabs fetches → a half-dead socket
       left the call awaiting forever (the "stuck on Writing script for
       20 min" symptom). Added `fetchWithTimeout` (150s; 5 min for the big
       Projects audio download) around all 7 request sites.
    3. Opaque "Failed to fetch" → now `describeGenerationError` gives a
       calm "keep your screen on and tap Generate again", plus a busy-gated
       hint under the button. 3 new tests.
- **Codified the worktree invariant in CLAUDE.md (`6f33000`)** + saved to
  project memory: Drive permission-denied spam is expected; safe = committed
  + pushed on main, not a clean tree; only prune on "deferred clean-up work".

## Next up
1. **Device-test the story-gen fix on the phone (v7 deploy).** Generate a
   story, deliberately let the screen sleep mid-run → it should now stay
   awake and finish; if it ever fails you get the friendly retry message,
   not a silent hang.
2. **Device-test content backgrounds + the singing-bowl meditation bed**
   (carryover, PENDING #5). Story bed continues after narration; meditation
   bed stops with the meditation; PWA installs cleanly.
3. **Optional cleanup (whenever):**
   `rm public/meditations/*.pre-loudnorm.mp3 public/stories/*.pre-loudnorm.mp3`
   — gitignored backups, safe to delete.

## Watch out for
- **No CACHE_VERSION bump for the story-gen fix, on purpose.** It's a
  code-only change; Vite content-hashes the bundle and the SW serves the
  shell network-first, so a cold online launch picks up the new code. A
  bump would needlessly force every install to re-download all bundled
  audio (~17 MB/story). Bump only on audio re-renders.
- **Remote-tracking refs are bloated to ~1000** (mostly duplicate
  `origin/main`) from Drive holding handles during fetches. `git branch -a`
  floods with thousands of `remotes/origin/main` lines. Cosmetic — main is
  pushed and clean — but clear it during "deferred clean-up work" along with
  the worktree dirs.
- **3 stray local branches** (`claude/objective-kirch-e41ce1`,
  `claude/optimistic-khayyam-1e864b`, `backup/pre-rebase-2026-05-30`) are
  all **0 commits ahead of main** — pure litter, nothing to preserve.
- **Tool output stalled badly all session** — results arrived in delayed
  batches; one Edit silently missed its anchor (caught + re-verified). If it
  persists next session, restart the session for a clean I/O channel.
