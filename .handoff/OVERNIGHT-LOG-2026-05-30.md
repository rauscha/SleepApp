# Overnight log — 2026-05-30

**Charter:** work through P1 items from `reviews/2026-05-29-deep-review.md` in order. Commit incrementally. Defer (don't force) anything that hits a permission gate or design ambiguity.

**Pre-flight decisions (locked in before run):**
- Tests: hand-rolled minimal AudioContext mock, no new deps.
- Bedtime gating: disable Generate button + show quiet "daytime activity" note between 21:00–06:00. Library browsing unaffected.
- Body text: introduce `.body-text` / `.ui-label` component layer in index.css so the 16px rule has a semantic guardrail.

**Working tree at start:** clean from a tracked-file perspective.

---

## Done overnight

All 7 main P1 items from the action plan, plus one additional P1 flagged in Appendix G — eight clean commits, every one with typecheck + tests green. **Test count went from 81 → 113 (+32 new tests).**

### P1.1 — Body text 16px sweep + component layer  (commit a9c9a53)
Added a `@layer components` block in `src/index.css` with two semantic classes (`.body-text` for 16px paragraphs/labels, `.ui-label` for 14px-only metadata) so the 16px brief rule has a guardrail instead of living in your head. Migrated every screen (Tonight, Library, StoryGenerator, Settings, Player, ContentPlayer, ErrorBoundary, BottomNav). Also bumped the worst-offender 10–11px chrome (Dev tools footer, bottom-nav labels) to ≥12px, and grew sub-44px secondary buttons to a real touch target while I was in there.

### P1.2 — Timer state text labels  (commit ce574ec)
Each of the four sleep-timer states now has its own word: "set timer" / "pick a time ×" / "▸ 27:00" / "fading…". You're colourblind, so the previous all-grey colour cue wasn't doing the work the codebase was asking it to. Colour stays as reinforcement, but the *label* is now the load-bearing signal. Same pattern mirrored into the Nightstand status row so both display modes share one language.

### P1.3 — Worklet promise no longer permanently poisoned  (commit a73f4b5)
`AudioEngine.loadNoiseWorklet()` used to memoize a rejected promise forever — one transient failure (network blip, stale SW after a deploy) and every later tap was silently dead until you reloaded the tab. Now the cached promise clears itself on failure (with a guard so a concurrent successful retry can't be wiped) and the next user gesture re-tries cleanly. Regression test for this lives in `AudioEngine.test.ts` so a future refactor can't silently undo the fix.

### P1.4 — Bedtime gating of the Generate CTA  (commit 5d32d69)
The "Generate new story" button now disables itself between 21:00 and 06:00 with a small italic note ("A daytime activity. Try again after 6am."). Library browsing is untouched — only the 2–5-minute, ~$1–3 generation flow gets gated. The window logic lives in `src/lib/bedtime.ts` so it can be unit-tested independently and reused later if you want a daytime-only Settings affordance. A once-a-minute interval re-evaluates the gate so it flips cleanly across the boundary if the screen is open.

### P1.5 — Plaintext-storage warning under the API-key fields  (commit 26ba509)
The existing intro paragraph already told you the keys never leave the device — but it didn't say they sit unencrypted in localStorage, where DevTools can read them in five seconds. Added a one-line italic note: "Stored unencrypted on this device — anyone with access to this unlocked browser can read them. Consider rotating quarterly." Same `body-text` class as the rest of the section so it can't drift below 16px.

### P1.6 — Story-generation double-tap guard + 30s dedup  (commit 30b02e7)
Three reinforcing layers (visible Cancel/Generate swap, function-level re-entrance guard, and a 30-second dedup memo keyed on `(theme, voice)`). A duplicate within the window returns an inline "Already generating that one. Give it a moment." instead of paying ElevenLabs again. The memo lives in a useRef (so it sees the freshest value without waiting on a re-render) and clears on Cancel/failure so a deliberate retry is never blocked.

### P1.7 — Lifecycle tests for the audio engine  (commit 6f03f72)
The big one. The pure-math files (crossfade, sceneFormat, ToneMatcher) have had tests since Phase 1; the **lifecycle** code where overnight bugs actually live (`AudioEngine`, `FileLayer`, `SceneCoordinator`) had none. Wrote a hand-rolled minimal `MockAudioContext` in `src/test/audioMock.ts` (~280 lines, zero new deps, records scheduled events so assertions are clearer than they'd be against real audio) and 25 new tests:
- **AudioEngine (8):** unlock+resume, statechange events, worklet memoization, **P1.3 regression test for the rejection cache**, layer cap + override, removeLayer.
- **FileLayer (9):** constructor validations, pre-fill of LOOKAHEAD_COUNT=3 iterations at correct times, chain timer keeps the pipeline alive across iteration periods (load-bearing "never-starve" invariant), fadeAndDispose ramps + stops sources, setVolume mid-play, idempotent stop.
- **SceneCoordinator (8):** loadScene constructs synth + N elements, tinnitus inclusion, 404 fallback, fallback off + 404 rethrows, startScene wires + fades in, crossfadeTo overlaps, stopScene fades + clears.

Hand-rolled over `web-audio-test-api` because that lib is unmaintained since 2018 and the modern Web Audio spec has drifted away. The mock here is small enough to maintain in-house and only does what the engine actually needs.

### P1.8 — Synthetic-fallback only on real 404s  (commit ce88594)
Appendix-G P1 demoted from the original list but worth doing in the same pass. `SceneCoordinator.loadVariant` used to silently substitute a synth pad for *any* fetch/decode failure under `fallbackToSynthetic=true`, hiding real production breakage behind the "scene loaded successfully" path. Now `loadAudioBuffer` throws a typed `AudioLoadError` whose `kind` distinguishes `'not-found'` (intentional dev convenience — the JSON references a file not yet ingested), `'http'` (5xx etc.), `'network'` (offline / CORS / abort), and `'decode'` (corrupted file). Only `'not-found'` falls back. Two new tests anchor the new behaviour against network and HTTP-500 stubs.

---

## Waiting on you

Three items I touched but want your call on rather than ship blind. None blocks tonight's sleep test.

### 1. Scene card hierarchy on 375px iPhone SE (Appendix D, P1)
**What:** the review flags that scene cards rely on size scaling without min-width breakpoints and asks for visual verification on a 375px viewport. **Why deferred:** I can't see the rendered UI from this session — verifying "does this look right on iPhone SE" needs you in front of the screen. **What I'd do:** open the dev server at `https://crane-desk.saiga-wage.ts.net/SleepApp/`, resize to 375px (or open on the phone over Tailscale), and walk through Tonight / Library / Player / Settings looking for: horizontal scroll on the scene cards, the "Begin →" / "→" overflow on a long scene description, the timer-picker pill row wrapping awkwardly, the bottom nav label squeeze. If you find issues, I can fix in a focused next session. If it looks fine, close this item.

### 2. Button border-radius and secondary-style consolidation (Appendix D, P1)
**What:** the review flags that `rounded-soft` vs `rounded-softer` vs ad-hoc radii are sprinkled around, and three different "secondary button" styles (gray pill, ghost border, filled ink) coexist across screens. **Why deferred:** consolidating these is a real visual decision — picking which radius and which secondary style is "the one" needs your taste, and unilaterally pushing one would risk a fight with you in code review later. **Recommendation:** in a focused session, sweep the codebase for `rounded-soft|rounded-softer|rounded-md|border\s+border-` on `<button>`s, pick one secondary style (the moon-300 ghost outline used by "Generate new story" reads cleanest to me — but you should decide), migrate everything, document the choice in `DECISIONS.md`. Effort: ~30 min once direction is picked.

### 3. About the 12 worktree-cleanup warnings on every commit
Cosmetic, but you'll see them. Every `git commit` tonight emitted twelve lines of `error: failed to delete '.git/worktrees/<name>': Permission denied`. These are stale worktree metadata directories under `.git/worktrees/` from previous sessions — Git tries to prune them on each commit and Windows holds locks that prevent the delete. Commits succeeded fine; the errors don't block anything. **To clear them up** when you're ready (not now — they may belong to another running Claude session): `git worktree prune` and then manually `rm -rf .git/worktrees/<name>` for any that prune doesn't remove. Don't run this if you have another Claude session active in a worktree.

---

## Test summary

```
Before tonight: 81 tests, 6 files
After tonight:  113 tests, 10 files
New files:
  src/lib/bedtime.test.ts             (5 tests — bedtime window)
  src/audio/AudioEngine.test.ts       (8 tests — lifecycle + worklet retry regression)
  src/audio/FileLayer.test.ts         (9 tests — pipeline + chain timer + fade)
  src/audio/SceneCoordinator.test.ts  (10 tests — scene load/start/crossfade/stop + error kinds)
```

Every commit ran `npm run typecheck` and `npm test` green before going in.

---

## Commits, in order

```
a9c9a53  P1.1: Body text 16px sweep + .body-text / .ui-label component layer
ce574ec  P1.2: Timer state text labels — never rely on colour alone
a73f4b5  P1.3: AudioEngine clears cached worklet promise on failure
5d32d69  P1.4: Gate story-generation CTA between 21:00 and 06:00
26ba509  P1.5: Plaintext-storage warning under the API-key fields
30b02e7  P1.6: Story generation — double-tap guard + 30s dedup window
6f03f72  P1.7: Lifecycle tests for AudioEngine, FileLayer, SceneCoordinator
ce88594  P1.8: Synthetic-fallback only on 404 — network/decode errors surface
```

All on `main`, not yet pushed — let me know if you want me to push, or do it yourself after reviewing.
