# Session hand-off — 2026-06-03 (machine: desktop)

## STATE (read this first)
- Branch: `main`, synced with `origin/main` at `0318e5f`. Ahead/behind 0/0.
- Working tree clean. Tests 116/116 green; `npm run typecheck` clean.
- **3 commits this session, pushed.** App is functionally complete for daily
  personal use — all 8 scenes have card photos, story titles come from Claude,
  stop-all is one tap.

## Done this session
- **Singing-bowl card photo (`424a091`).** Petr Sidorov photo from Unsplash
  (photo-1627764627459-ba29d6051fe0). Downloaded at 1200×800, wired into
  `sceneBackground.ts`. All 8 scenes now have curated card photos.
- **Story title generation from Claude (`daaa2b2`).** `STORY_SYSTEM_PROMPT`
  now asks Claude to prefix output with `<title>2–5 word title</title>`.
  `callClaude()` parses and strips the tag; title goes to metadata, clean
  script goes to ElevenLabs. Falls back to `deriveTitle(theme)` if tag is
  absent. 52/52 tests still green.
- **Stop-all button in ContentPlayerScreen (`0318e5f`).** Header now has
  `← Library` (left) and `■ Stop` (right). `■ Stop` cuts narration + bed
  scene immediately and returns to Library. `← Library` still leaves the
  bed running as before.
- **Signal interruption investigation dropped** (user decision — edge case
  not worth pursuing for a personal app). Removed from next-up list.

## Next up
1. **Wire in the new story** the user generated today — once it finishes,
   open Library → confirm title looks right (should be a short Claude title,
   not the raw prompt). No code work needed unless something's wrong.
2. **Device test** one overnight pass: story-gen sleep fix, content
   backgrounds, background slider keep-alive. Smallest red flag is most
   informative — just flag symptoms, don't self-diagnose.
3. **Coordinator wake-lock gap** (low priority) — if you back out of
   ContentPlayerScreen while a story-style bed is still running, the
   Library/Tonight screens don't own a wake lock. Fix when convenient.
4. **Phase 5** (PWA, iOS device test, perf) — explicitly deferred.

## Watch out for
- The story the user was generating mid-session used the **old code** (no
  title tag). Its title will be the raw theme text. That's expected — only
  stories generated after `daaa2b2` get a Claude title.
- No CACHE_VERSION bump needed — both code commits are JS bundle changes;
  Vite content-hashes those automatically.
- Worktree / refs litter unchanged. GDrive permission-denied spam on commit
  is cosmetic. Safe = pushed on main.
