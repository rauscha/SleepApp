# Session hand-off — 2026-06-01 (machine: desktop, continued)

## STATE (read this first)
- Branch: `main`, synced with `origin/main` at `67eaabf`. Ahead/behind 0/0.
- Working tree clean of project changes. Untracked items are personal /
  non-project (mkcert .pem certs, .gdoc pointers, go.js/vbs, reviews/,
  mkcert-go.bat) — same set as the prior hand-off, unchanged.
- Tests 116/116 green; `npm run typecheck` clean.
- **1 commit this session, pushed.** No CACHE_VERSION bump — code-only.

## Done this session
- **Background slider + overnight-stop fix on ContentPlayerScreen
  (`67eaabf`).** Two failure modes the user hit overnight on a story,
  fixed in one logical change:
    1. Voice was way off balance with the bed underneath. Added a single
       "Background — N%" slider (only shown when a bed is paired). It
       multiplies onto the master bus while ContentPlayerScreen is mounted
       and restores 1× on unmount. New `contentBedAttenuation` setting
       (default 0.5) — persists what you last set.
    2. Sound stopped overnight. Root cause: wake lock + SW keep-alive
       + AudioContext silent loop were all tied to `state === 'playing'`,
       so they released the moment narration ended, leaving the story
       bed to limp along without any focus signal until iOS/Android
       eventually pulled the tab. Now `bedKeepsScreenLive` keeps all
       three signals alive whenever a bed is paired and hasn't been told
       to stop with the content. 'ended' + `continue` → lock held;
       'ended' + `stop-with-content` (meditation bed faded) → released.

## Next up
1. **Device-test all three pending items in one overnight pass on v7:**
    - Story-generation sleep fix (carried over, `52ec0cc`)
    - Content backgrounds + singing-bowl meditation bed (carried over,
      `cd48c24` + `b766f8b`)
    - **The new Background slider + bed-keeps-alive fix (`67eaabf`).**
      Specifically: fall asleep to a story; bed should still be playing
      in the morning. Drag the slider during the story to see if 50% is
      the right starting default.
2. **Optional cleanup (whenever):** `rm public/meditations/*.pre-loudnorm.mp3
   public/stories/*.pre-loudnorm.mp3` — gitignored backups, safe to delete.

## Watch out for
- **Residual wake-lock gap (known, not fixed yet).** If the user backs
  out of ContentPlayerScreen while a story-style continue-bed is still
  running, Library/Tonight don't own a wake lock for the bed, so it'll
  hit the same overnight-suspension problem on a longer fuse. Proper fix
  is a coordinator-owned keep-alive that engages whenever the coordinator
  has a current scene, regardless of which screen is mounted. Left for a
  follow-up commit — this session's fix covers the common case ("fell
  asleep on the player screen").
- **No CACHE_VERSION bump.** Code-only change; Vite content-hashes the
  bundle and the SW serves the shell network-first. Cold online launch
  picks up the new code without forcing every install to re-download all
  audio. Only bump on audio re-renders.
- **Worktree / refs litter unchanged from last session.** Same ~1000
  duplicate `origin/main` refs, same 16 stuck `.git/worktrees/` dirs,
  same 3 stray local branches (`claude/objective-kirch-e41ce1`,
  `claude/optimistic-khayyam-1e864b`, `backup/pre-rebase-2026-05-30`,
  all 0 ahead of main). All cosmetic; safe = pushed-on-main, which we
  are. Clean only on "deferred clean-up work".
