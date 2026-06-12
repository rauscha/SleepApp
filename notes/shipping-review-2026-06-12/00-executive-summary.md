# SleepApp v1.0 Shipping Review — Executive Summary

**Date:** 2026-06-12
**Scope:** Full-codebase review by eight independent reviewers: security, code quality & architecture, bug hunt, UX/UI design, utility, fun & delight, originality, and next-level ideation. Each full report lives alongside this document (`01`–`08`).

---

## The verdict

**This is a genuinely strong, near-shippable product — but it is not v1.0 tonight.** The bug hunt found two Critical and three High bugs that sit squarely on The One Thing ("put me to sleep and let me stay there"): each one is a way the audio dies mid-night or the sleep timer betrays you. They are all well-understood, well-localized, and fixable in days, not weeks. Everything else — security, architecture, design polish — is either already in good shape or on a clear punch list.

### Scoreboard

| Front | Verdict | Report |
|---|---|---|
| Security | **Ship it** — no Critical/High findings; unusually well-defended for a client-only PWA | 01 |
| Code quality & architecture | **A−** — disciplined, strict, 138/138 tests green, 63.8 kB gz main bundle | 02 |
| Bug hunt | **2 Critical, 3 High, 6 Medium, 5 Low** — the ship blockers live here | 03 |
| UX/UI design | **B−** — best-in-class interaction design wearing an unfinished visual identity | 04 |
| Utility | **7.5/10** — the engineering budget went to the right invisible place | 05 |
| Fun & delight | **6.5/10** — deep real craft, too modest about it; ~5 cheap patches from a 9 | 06 |
| Originality | One genuinely rare system, two smart twists, one feature to rethink | 07 |
| Next-level ideas | 17 ideas + 4 anti-ideas; a clear v1.1 trio | 08 |

---

## The five ship blockers (all from the bug hunt, report 03)

1. **[Critical] Leaving the Player strips every overnight protection while audio keeps playing.** `PlayerScreen.tsx:150–160` unmount cleanup stops the keep-alive (and its `<audio>` element sink), the SW keep-alive, the wake lock, and the media session — but "← Scenes" deliberately leaves the scene running. One tap converts the night session into a freely-discardable tab; Android kills it within ~10 minutes of locking the phone. The protections must follow the *audio*, not the *screen*.
2. **[Critical] One refused replay silences the night invisibly.** `AudioEngine.ts:308–319` retries `el.play()` exactly once after an OS-initiated pause of the element sink. If that retry is refused, audio flows into a paused element forever — while the AudioContext stays `running` with `currentTime` advancing, which is precisely the state the zombie watchdog and `verifyContextAlive()` cannot see. This is the one remaining mid-night failure mode the entire survival stack is blind to.
3. **[High] An orphaned sleep-timer timeout kills a later scene.** The 90s `fadeExitTimer` is never cleared on unmount; timer fires → exit mid-fade → start a fresh scene → 90 seconds later the stale timeout stops it.
4. **[High] The sleep timer itself is component-local state.** Set a 60-minute timer, browse away from the Player, and the countdown silently dies — the scene plays at full volume all night after the UI confirmed "Stops in 59:32".
5. **[High] IndexedDB story saves resolve before the transaction commits.** A quota abort after `onsuccess` loses a $1–3 generated story while reporting success (`assets.ts:51–69`; `deleteStory` directly below already does it correctly via `tx.oncomplete`).

---

## Where the reviewers converged (independent agreement = high confidence)

**The 515 loop offset — found independently by four reviewers** (code quality, bug hunt, fun, originality). `rain-on-window.json` uses `loopOffsetSeconds: 515` (= 5×103) for rain-pavement, off the canonical prime list that CLAUDE.md calls "the contract." Coprime by luck, broken contract by the letter. **Important:** the obvious one-number fix to 521 will break the scene — `pavement-2.mp3` is 525s, one second short of the required 526s (offset + 5s crossfade). Extend the audio first, then fix the number, then **add the conformance test** that validates every scene JSON against `sceneFormat.ts` — the deeper finding is that the project's most sacred rule is enforced by nothing.

**Three photos break the spell — flagged by both design-minded reviewers** (UX/UI, fun). `singing-bowl.jpg` is Buddha-statue stock — literally the "loud wellness iconography" the brief bans; `forest-day.jpg` is a daylight park snapshot with a pedestrian in it; `monsoon.jpg`'s near-white sky is a flashlight at 2am. The other five (ocean-night and rain-on-window especially) are excellent and exactly the brief.

**The 3am wake is the least-served half of The One Thing — converged on by utility and ideation.** "Put me to sleep" is superbly served; "let me stay there" has no affordance for the half-asleep, photophobic user at 3am: full unlock → bright Tonight screen → scene tap → 8s fade. Both reviewers independently specified the same fix — a near-black, one-tap "back to sleep" panel that resumes the last scene softly (the "3 a.m. Door," ~a weekend of work on existing machinery).

**The app brags about the wrong thing — converged on by fun and originality.** The self-declared crown jewel (the Eno prime-offset loop engine) is well-executed *prior art* — myNoise has shipped never-repeating layered stems since 2013. The genuinely rare system is the unglamorous **all-night mobile-web survival stack** (lookahead pipeline, zombie-context watchdog and mid-night graph rebuild, element-sink discard immunity): the originality reviewer found no shipping web equivalent anywhere — every serious competitor went native to avoid solving this. Meanwhile the fun reviewer's point completes the thought: the loop engine, whatever its provenance, is *completely invisible to the user* — indistinguishable in the UI from a looping MP3. One sentence of player copy is the entire "show a friend" moment, unbuilt.

**Quiet failure modes are on by default — security and code quality found the same pattern in different places.** `fallbackToSynthetic: true` in production paths means a 404 from a bad deploy plays a synthesized test pad all night instead of failing loudly; the `VITE_*` env-key path means one local `npm run build` + manual deploy away from publishing live API keys in the bundle. Same fix shape for both: gate on `import.meta.env.DEV` so the dangerous path is structurally impossible in production.

---

## What's genuinely excellent (keep doing this)

- **The overnight-survival architecture** — called the codebase's crown jewel by the code reviewer and the app's only "Visionary"-rated component by the originality reviewer. Each mechanism is documented against the real logged incident that motivated it.
- **Nightstand mode** — the UX reviewer's "most beautiful thing in the app": the 1800ms exhale to OLED black, tap-to-wake dim controls, two-tap stop. Better than iOS StandBy for this use case.
- **The security posture** — clean git history across all 56 commits, real CSP pinned to exactly two API hosts, zero `innerHTML`, a service worker that never touches API calls, and a CI deploy that deliberately refuses to pass keys.
- **The writing voice where it exists** — "A daytime activity. Try again after 6am." / "90s fade. Walk away." / the story prompt's *"It is fine — even good — to end mid-sentence. The listener is already asleep."* Both bundled stories really do dissolve mid-sentence.
- **The anti-feature discipline** — no alarm, no tracking, no accounts, no streaks; the bedtime gate on story generation; building a complete tinnitus engine and having the restraint to hide it.

## What to rethink

- **The bundled AI-generated meditations** — the originality reviewer's only "poorly copied" rating: three boilerplate-prompt TTS tracks are a strictly worse version of what Calm/Headspace give away free with human narrators. Either invest the prompt/voice craft the stories got, or cut them. (The utility reviewer notes the opposite about *quantity*: ~25 minutes of meditation content is the catalogue's stale point — so this is rethink-then-expand, not just expand.)
- **The fall-asleep screen's hero element is a 128px ember-red Stop disc** — both design reviewers flagged it: the destructive action is the brightest object on the screen you close your eyes to.
- **A visible "Dev tools" button on Tonight** plus ~700 lines of dev Harness shipped in the main `App.tsx` bundle — the religion of this app is removing everything that isn't sleep; the dev tooling should be invisible and lazy-loaded.

---

## Recommended path to v1.0

**Week 1 — the blockers.** Fix the five bug-hunt blockers (protections-follow-audio, element-sink replay watchdog coverage, the two timer bugs, transaction-commit semantics). Gate `fallbackToSynthetic` and env-key loading on `import.meta.env.DEV`. Extend `pavement-2.mp3`, fix 515 → 521, and land the scene-conformance test so the contract enforces itself. Delete dead `Analyser.ts`.

**Week 2 — the identity.** Ship the serif font (`@font-face` for EB Garamond — the signature element of Midnight Editorial Minimalism currently renders as a system-font lottery). Bump `stone-400`/`stone-500` text one palette step up to clear AA contrast. Replace the three off-brief photos. Fix the 14px scene-card descriptions violating the project's own 16px floor. Hide the dev tools; extract and lazy-load the Harness.

**Then call it v1.0.** Security has already signed off; the architecture grade is A−; the test suite is green.

**v1.1 — make the promise whole.** The ideation trio compounds: the **3 a.m. Door** (closes the biggest utility gap), **Night Drift** (the forest triptych becomes a time-passing sequence — proof of "compose the night, not the scene"), **Narration Sundown** (stories submerge instead of ending — a state change is a wake event). Add a bedtime greeting (`isBedtime()` is built, tested, and currently used only to disable a button) and one sentence of player copy that finally tells the user the soundscape is being performed live on prime-length loops and won't repeat tonight. Expand the meditation catalogue only after the format rethink.

**Never.** Sleep tracking, smart alarms, cloud sync, social anything, voice control — all four anti-ideas in report 08 are well-argued and align with the brief. The icon must keep meaning *bed*.

---

## Report index

| # | Report | Reviewer lens |
|---|---|---|
| 01 | `01-security.md` | Application security, threat-model-calibrated |
| 02 | `02-code-quality.md` | Architecture, tech choices, maintainability |
| 03 | `03-bug-hunt.md` | Verified bugs with traces; scene-JSON audit |
| 04 | `04-ux-ui-design.md` | Sleepy-user ergonomics, brief adherence, contrast math |
| 05 | `05-utility.md` | Job-to-be-done fit, the nightly cycle, offline value |
| 06 | `06-fun.md` | Atmosphere, craft, writing quality, micro-delights |
| 07 | `07-originality.md` | Visionary → trash taxonomy vs. prior art |
| 08 | `08-next-level-ideas.md` | 17 tiered ideas, 4 anti-ideas, the v1.1 trio |
