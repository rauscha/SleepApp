# Utility Review — Sleep App (pre-v1.0)

**Reviewer focus:** usefulness, helpfulness, reliability-in-purpose, and appropriate multipurpose value, judged against the app's own brief: *"Put me to sleep and let me stay there."* Single user, no accounts, no telemetry, no alarm.

---

## Verdict: 7.5 / 10

This is a genuinely useful tool for its one user, and — rarer — it is useful *in proportion to how much engineering went into the invisible parts*. The falling-asleep path is excellent: one tap from open to audio, auto-timer, auto-Nightstand, a black screen, and a soundscape engine that provably doesn't loop. The reliability machinery (keep-alives, watchdog, zombie-context rebuild, diagnostics export) shows the team understood that for a sleep app, "it kept playing all night" *is* the product.

What keeps it from an 8+: the **3am wake path is the least-served moment of the night** despite being half of the stated One Thing ("…and let me stay there"); the meditation catalogue is thin enough to go stale; and the always-on screen wake lock — the pragmatic fix for Android tab-freezing — quietly trades battery and burn-in for reliability without the user ever being offered the trade.

---

## 1. Job-to-be-done fit: walking the nightly cycle

### Open the app in bed → audio playing
**Grade: A.** This path has been ruthlessly optimized:

- Tonight screen opens by default (commit `afda504` deliberately dropped last-screen persistence so the picker is always first).
- Last-played scene is the headline card; one tap starts it. The tap doubles as the AudioContext unlock gesture *and* the fullscreen request (`TonightScreen.handlePick` does both synchronously before any await — correct gesture handling).
- A default sleep timer, if set in Settings, starts automatically — zero extra taps.
- After 30s idle the Player auto-engages Nightstand: flat black, controls revealed on tap for 3s, fullscreen re-requested opportunistically. The 1800ms "exhale" crossfade to black is a nice detail that serves the purpose rather than decorating it.
- "Surprise me" excludes the last-played scene — a small but correct touch.

Friction count from lock screen to asleep-ready: unlock phone → tap app → tap scene. That's about the floor for a phone-based solution.

### Falling asleep
**Grade: A−.** The Eno-style incommensurate loop offsets (251/409/521/691/887s primes, LCM ≈ 28h) mean the soundscape genuinely never audibly repeats within a night. The synth bed glues the spectrum; sparse event layers (distant dockside, thunder) add life without startle risk. The story/meditation path is also well thought out: stories leave their bed scene running all night after narration ends ("the room stays filled"), meditations stop their bed with the content — the right semantics for each.

One residual: the Player's stop button is a large ember-colored circle; in Lush mode the screen is a photo. Anyone staring at the screen while drifting off is well served by Nightstand auto-engage, but 30 seconds of bright-ish photo is the brightest moment of the wind-down. Minor.

### 3am wake → back asleep
**Grade: C.** This is the gap. Walk the actual scenarios:

1. **Audio still playing (no timer):** best case — do nothing, drift back. Served well, *provided the audio actually survived* (see §2).
2. **Timer faded audio out at midnight, you wake at 3am wanting sound:** you must wake the phone, unlock it, get to the app (it should still be foregrounded in Nightstand… if the wake lock held), and tap. If the tab was reclaimed you're back at Tonight via a cold start — full brightness app load, scene card tap, 8s fade-in. There is no "quiet resume" affordance: no dimmed one-tap restart, no reduced-volume re-entry, nothing that acknowledges the user is now half-asleep and photophobic. The app's most carefully engineered moment (first wind-down) and its least (re-wind-down) bracket the same night.
3. **Audio died silently (tab killed / context zombie the watchdog couldn't fix):** the user discovers silence, and recovery is scenario 2 plus confusion. The diagnostics log helps the *developer* the next morning; it does nothing for the *sleeper* at 3am.

Nothing here violates the anti-goals — a "resume last scene at 60% volume" card, shown when the app reopens within the bedtime window after a recent session, would be entirely in-discipline and is the single highest-utility missing feature.

### Helping you NOT pick up the phone
**Grade: B+.** The bedtime gate on story generation (`src/lib/bedtime.ts`, 21:00–06:00) is the standout idea in the whole app: it correctly classifies generation as daytime executive-function work and refuses to invite it at 11pm ("A daytime activity. Try again after 6am."). Nightstand's flat black removes the screen as a stimulus. No notifications ever means the phone never initiates contact. What's missing is only what's structurally impossible: the phone is still a phone, and the app can't stop Signal from being one tap away. Within its power, it does the right things.

### Morning
**Grade: B.** By design there is no alarm and no "sleep score" — correct. The morning experience is: wake, tap Stop (big target, works from Nightstand), done. If the timer ran, the app already returned to Tonight and there's nothing to do at all. Two real morning costs go unmentioned anywhere in the UI: (a) the phone spent the night with its screen on (wake lock) at whatever battery cost that implies, and (b) if anything *did* die overnight, the only acknowledgment is buried in Settings → Diagnostics. A failed night currently looks identical to a successful one unless the user goes digging.

---

## 2. Reliability as utility

**This is where the engineering budget visibly went, and it was the right place.** The defensive stack, bottom to top:

- **FileLayer 3-iteration lookahead** (`LOOKAHEAD_COUNT = 3`): audio for the next ~3 loop iterations is already scheduled on the AudioContext clock, so iOS/Android setTimeout throttling cannot cause a seam. The chain-timer design (`pipelineTail`, `lastHandledStartTime`) is documented as load-bearing in CLAUDE.md.
- **SilentKeepAlive**: a looping 1s zero buffer through the master bus, defeating Android Chrome's "silent context" suspension heuristic.
- **SW keep-alive ping** every 20s so a reclaimed tab can cold-start fast from cache.
- **Screen wake lock** while a scene or content bed is live.
- **MediaSession kept in 'playing' state after narration ends** (commit `9ae8de6`) — fixing a real observed failure ("fell asleep to a story, woke up to silence") where dropping media priority at narration-end invited Android to freeze the tab hours later.
- **Zombie-context watchdog** (2s tick) that detects both the honest failure (state stuck suspended/interrupted) and the dishonest one (state 'running', `currentTime` frozen) and **rebuilds the context mid-night without user interaction** (commits `85fd944`, `138adb1`), with a rebuild-loop floor.
- **Real `<audio>` element routing for discard protection** (latest commit, `c4ee7fc`).
- **Diagnostics lifecycle log** with build-ID stamping, local-time export, share/copy/download — purpose-built for the "overnight session ended early" post-mortem loop, and the git history shows it being used that way (the Signal-interruption incident).

The git log reads like a sequence of real overnight failures, each diagnosed and fixed: this is reliability earned empirically, not speculated. The error messaging is similarly mature — generation failures map to actionable advice ("keep your screen on and retry"), failed synthesis preserves the paid-for Claude script in the console, the ErrorBoundary exists specifically to "never white-screen at 3am."

**Remaining risks that undermine the core utility:**

1. **iOS Safari overnight behavior is still flagged as untested on hardware** (DECISIONS.md §14, Phase 5). The notes directory suggests the actual device is Android, which is where the hardening landed — but if an iPhone is ever the bedside device, the whole stack is unverified there.
2. **The wake lock contradiction.** TODO_PHASE2.md B4 says, correctly, "the screen MUST sleep — that's what the user wants. We must NOT request wake lock by default." The shipped code does the opposite: `useWakeLock(scene !== null)` holds the screen on all night (black, but on). This was evidently a deliberate pivot — a lit tab is the only reliable way to keep an Android browser tab alive 8 hours — but the cost (battery drain, OLED wear, a glowing rectangle if fullscreen ever drops) is silent and unconfigurable. The decision deserves to be at least visible, ideally a setting ("Keep screen on for reliability — recommended").
3. **No in-app failure acknowledgment.** When the watchdog rebuilds a context or a session dies, the user finds out from silence. Even a one-line "last session ended unexpectedly at 2:14 — see Diagnostics" on the next Tonight load would convert mystery into information.

Net: for its actual deployment target the all-night reliability is strong and battle-tested. Score this section high, with the asterisk that reliability achieved *by keeping the screen on* is a workaround wearing an invariant's clothes.

---

## 3. Content depth

**Scenes: deep enough, and structurally stale-proof.** 8 scenes (7 sleepable + singing-bowl as a meditation bed) sounds thin, but the incommensurate-loop design means a scene doesn't wear out the way a 1-hour YouTube loop does — the combined pattern repeats on a ~28-hour cycle and variant rotation reshuffles the material besides. 406 MB of multi-variant source audio backs this. The catalogue covers the canonical sleep territories (rain ×2, forest ×3, ocean, fire) with sensible mixing discipline codified in CLAUDE.md. For one user, 7 scenes with no loop fatigue is more like 20 scenes from a lesser engine. The genuine gaps are the brief's own unbuilt candidates (beach-gentle daytime, train interior, airplane cabin — the AUDIO_SOURCES.md table already has search terms for them).

**Stories: thin bundled, but generation genuinely extends shelf life.** 2 bundled (~21 min each) plus on-demand generation. A sleep story is the content type that *most* benefits from regeneration — you fall asleep ten minutes in, so even a familiar story has unheard back half, and a new theme costs one daytime form-fill and ~$1–3. Stories are saved permanently and the UI correctly nudges replay over regeneration. This is the strongest AI-extends-shelf-life case in the app.

**Meditations: the stale point.** 3 items totaling ~25 minutes, generated once via CLI (`tools/gen-meditation.ts`), no in-app generation path. A nightly body-scan user exhausts this in three nights and will recognize every word within two weeks. Because generation is CLI-only, refreshing the catalogue requires a dev session, not a Settings tap. This is the one place the catalogue actually goes stale — and also the cheapest to fix (run the existing tool a few more times; the brief's pre-generated-not-on-demand decision is right, it just needs ~10 items instead of 3).

**Where AI generation does NOT extend shelf life:** scenes. The brief is explicit (AUDIO_SOURCES.md: AI soundscapes are "not there yet" for hours-long ambience), and scene depth therefore grows only with manual sourcing/transcoding weekends. That's fine — scenes don't decay — but it means catalogue growth has a real labor cost in exactly the content type used most.

---

## 4. Multipurpose value — judged carefully

**Legitimate generalizations the current design already supports, free:**

- **Focus/work ambience.** Scene playback is ungated by hour; the same non-repeating forest works at 2pm at a desk. No code change needed. (The bedtime gate only blocks story *generation* — correctly.)
- **Naps.** Default timer + 15/30-min options + one-tap start is already a complete nap product.
- **Travel / noisy hotels.** The offline precache (~290 MB, resumable, skip-already-cached) is the sleeper feature here: a PWA that masks a noisy hotel HVAC with no network and no roaming data is genuinely valuable, and it already exists.
- **Tinnitus masking.** Engine built, UI shelved — the right call. The capability is preserved at zero ongoing UI cost; un-shelving is a design problem, not an engineering one.

**Generalizations that should stay rejected (and currently are):**

- Alarm/wake features — would invert the product's one trustworthy property (it never makes noise at you).
- Sleep tracking/scoring — anti-goal, and the data would demand the telemetry the app proudly lacks.
- Sharing/social/multi-user — the BBC-license note even flags that a shareable build changes the licensing posture; single-user is load-bearing.
- On-demand *nighttime* generation of anything — the bedtime gate's logic generalizes: nothing that costs money or executive function should be reachable from a pillow.
- A "focus mode" UI — tempting and unnecessary; the scenes already do it without a dedicated surface. Build nothing.

The app generalizes exactly as far as a good white-noise machine does — by being good at continuous ambient audio — and no further. That's the correct radius.

---

## 5. Cost/dependency utility: what survives with no keys, no network

**Almost everything — this is a major strength.**

| Capability | No API keys | No network (after precache) |
|---|---|---|
| All 8 scenes | ✓ | ✓ (precached) |
| Synth noise beds (white/pink/brown) | ✓ | ✓ (generated in-worklet, zero assets) |
| 3 bundled meditations | ✓ | ✓ |
| 2 bundled stories | ✓ | ✓ |
| Previously generated user stories | ✓ | ✓ (IndexedDB) |
| Sleep timer, Nightstand, mixer | ✓ | ✓ |
| Generate a new story | ✗ | ✗ |

The synthetic fallback (`fallbackToSynthetic: true` on every scene start) even degrades a 404'd scene file into a noise bed rather than silence. Keys live in localStorage (or build env), are used only for the one daytime feature, and their absence is handled with calm inline messages, not broken screens. The recurring cost of the entire core product is $0; the AI surface is a strictly additive ~$1–3-per-story luxury. For a personal app this is exactly the right dependency posture: **the part that has to work at 3am depends on nothing but the phone.**

One caveat: story generation also depends on build-time voice IDs (`VITE_VOICE_*`) and the user's ElevenLabs custom voices continuing to exist — a quiet external dependency for the long term, but it only ever degrades the daytime feature.

---

## 6. Honest comparison, for its single user

**vs. a "10-hour rain" YouTube video:**
- *Better:* no loop seam (YouTube long-plays are loops of short sources — the exact failure AUDIO_SOURCES.md calls out); no ads or autoplay-next at 3am; no bright recommendation UI; works offline; screen goes truly black; never stops at video end; per-layer mixing; no Google watching your sleep schedule.
- *Worse:* YouTube needs zero setup, zero maintenance, and has effectively infinite catalogue variety. If this app breaks, fixing it is your job.

**vs. Calm/Headspace:**
- *Better:* free after API costs; no subscription, upsell screens, streaks, or notifications — categorical absence of the engagement machinery that makes commercial sleep apps self-defeating; stories in your chosen voices on your chosen themes; you own every asset; nothing phones home.
- *Worse:* meditation catalogue is 3 items vs. thousands; no professionally produced sleep music; no polish team chasing every device quirk — you are the QA department, at 3am.

**vs. a $30 hardware white-noise machine:**
- *Better:* scene variety and layered realism; stories and meditations at all; travels in your pocket; sleep timer with a 90s fade instead of a click; mixer.
- *Worse, and worth saying plainly:* the machine never has a zombie AudioContext, never gets its tab reclaimed, never needs a wake lock, survives a power blip, and has a physical button findable with closed eyes. On pure "it kept making noise all night" reliability, dedicated hardware still wins, and the entire watchdog/keep-alive stack in §2 exists to close — not yet fully closed — that gap.

The honest synthesis: this app's durable advantages are *non-repetition*, *offline ownership*, *absence of engagement machinery*, and *personalized stories*. Its durable disadvantage is that it runs on a general-purpose phone OS that actively wants to kill it. The codebase knows this and fights well.

---

## Highest-utility-per-effort improvements, ranked

1. **A 3am quiet-resume path.** When the app is opened (or woken) within the bedtime window after a session ended in the last ~6 hours, offer a single dim card: "Resume Rain on the window — softly." Starts the last scene at reduced volume, straight into Nightstand. ~1 screen-state + a localStorage timestamp. This is the biggest gap in the One Thing and roughly a day of work.
2. **Generate ~7 more meditations with the existing CLI.** Zero new code; turns the stalest catalogue into a rotation that lasts weeks. An afternoon plus ElevenLabs cents.
3. **"Last night ended unexpectedly" notice on Tonight.** The lifecycle log already knows; surface one line with a link to Diagnostics. Converts silent failures into trust. A few hours.
4. **Make the wake lock a visible, settable decision.** One Settings toggle ("Keep screen on overnight for reliability — recommended on Android"), plus a measured battery number in the description. Resolves the B4 contradiction honestly. A few hours.
5. **Run the overnight soak on the actual bedside device per OS update** — semi-formalize the existing diagnostics habit: a checklist note, not code. The reliability stack is empirical; keep it that way deliberately.
6. **One travel scene (airplane cabin or night train interior).** AUDIO_SOURCES.md already lists sources; the train pairs with the existing night-train story. A sourcing-plus-transcode evening, and it strengthens the strongest multipurpose case (travel/hotel).
7. **(Cheap, optional) Morning-safe Stop confirmation skip-check** — verify the big Stop can't be fat-fingered at 3am into a full stop when the user meant tap-to-wake; Nightstand's reveal-then-stop two-step likely already covers this; confirm and move on.

Items deliberately *not* recommended: in-app meditation generation (keep it daytime/CLI), any wake/alarm feature, scene auto-rotation by time of night (clever, unrequested, risks startle), and AI-generated scene audio (the brief's "not there yet" judgment still holds).
