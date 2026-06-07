# Session hand-off — 2026-06-06 (machine: laptop)

## STATE (read this first)
- Branch: `main`, clean. Synced with `origin/main` at `ad46e7b`. Ahead/behind 0/0.
- Working tree clean. Tests 129/129 green; `npm run typecheck` clean.
- **4 commits this session, all pushed and deployed to GitHub Pages.**
- Two real bugs fixed end-to-end and confirmed working on the user's Pixel:
  the PWA bottom nav is back, and newly-generated stories now play correctly
  (no more noise). A third commit (odd-byte PCM) turned out to be treating a
  symptom of the noise bug — harmless, left in as a safety belt.

## Done this session
- **Chunked-TTS noise fix (`ad46e7b`) — the big one.** Newly generated stories
  on the chunked-TTS path played as pure white noise. Root cause: ElevenLabs
  reads `output_format` as a URL **query parameter**, but we were sending it in
  the JSON body, where it's silently ignored — so we asked for `pcm_22050`, got
  the default MP3, then reinterpreted those MP3 bytes as raw 16-bit PCM and
  wrapped them in a WAV header (compressed bytes read as samples = noise). Hid
  until this morning's `a2e0590` because the MP3 paths had the param ignored too
  but the default IS mp3, so they were right by accident. Fix: build the URL
  with `output_format` in the query string, drop it from the body. Added a
  content-type guard in `callElevenLabs` — if PCM is requested but `audio/mpeg`
  comes back, it now throws a clear error instead of silently producing noise
  (also catches the case where a plan tier doesn't support the PCM format).
  User regenerated a story after deploy → confirmed working.
- **PWA bottom-nav fix (`7e1f3c2`).** The installed (standalone) PWA on Android
  showed the Tonight scene cards but no bottom tab bar — couldn't reach Library
  or Settings. Worked fine in Chrome browser mode. Cause: `viewport-fit=cover`
  in `index.html` makes Android standalone draw edge-to-edge UNDER the system
  gesture/nav bar, so the bottom tab bar rendered behind it (Chrome reports
  `safe-area-inset-bottom` as 0, so the nav's padding couldn't rescue it).
  Removed `viewport-fit=cover`; Player immersion is unaffected (it uses the
  Fullscreen API, not cover). Confirmed fixed on the Pixel.
- **Stray `h-full` change (`8f01412`).** First (wrong) guess at the nav bug —
  changed the App root from `h-[100dvh]` to `h-full`. Didn't fix it (the real
  cause was viewport-fit), but `h-full` is cleaner than `100dvh` here, so left in.
- **Odd-byte PCM truncation (`1f82e83`).** Truncates a stray trailing byte before
  `new Int16Array(buf)` so an odd-length response can't throw. Moot for the noise
  issue (that data was already garbage), but a harmless safety belt — kept.

## Next up
1. **Device test (overnight)** — the one still-pending verification. Generate a
   story, let the screen sleep mid-run (should finish, not hang); confirm the
   bed scene continues after narration ends and survives back-out; fall asleep
   to a story and check the bed is still playing in the morning. See
   PENDING-DECISIONS #1 for the full checklist and commit refs.
2. **Wake-lock gap** (low priority) — backing out of ContentPlayerScreen while a
   story continue-bed is still running leaves Library/Tonight without a wake
   lock. Fix is a coordinator-owned keep-alive. PENDING-DECISIONS #3.
3. **Deferred clean-up** (only when you say so) — worktree litter, ~1000
   duplicate `origin/main` refs, 3 stray branches, loudnorm backups.
   PENDING-DECISIONS #11–12.

## Watch out for
- **Recommend a fresh session before the next work.** This one ran long and is
  full of debugging context (many file reads + error traces).
- The chunked-TTS path is the one used when the device's ElevenLabs key is
  TTS-only (no Projects access) — i.e. your phone. If a regenerated story ever
  comes back as noise *again* rather than throwing the new clear error, that
  means the key's tier doesn't support `pcm_22050` at all, and the right move is
  to drop PCM on that path and normalize MP3 a different way.
- Any story generated *before* `ad46e7b` on the chunked path is noise in
  IndexedDB — delete and regenerate it (the broken "The Last Light, Counted" was
  already re-done successfully this session).
- Worktree/Drive permission spam on every git op is expected and cosmetic. Safe
  = committed + pushed on main (it is), not a clean worktree dir.
