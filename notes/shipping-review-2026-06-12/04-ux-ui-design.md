# UX/UI Design Review — Pre-v1.0

**Reviewer lens:** senior product design critique against (a) mobile/dark-environment best practices and (b) the app's own stated design language, *Midnight Editorial Minimalism*: deep/dark, warm stone, editorial serif headings, moonlit sage accent, photography not illustration, no loud wellness iconography. Critical context: this is used **in bed, in the dark, by a sleepy person**. The One Thing: put me to sleep and let me stay there.

**Method note (honesty):** this environment has no headless browser, so the app was not run or screenshotted. The review is built from the full source of every screen (`src/screens/*`, `src/App.tsx`), the design tokens (`tailwind.config.js`, `src/index.css`, `index.html`), `src/lib/sceneBackground.ts`, the scene catalogue (`public/scenes/index.json`), and direct visual inspection of all eight photographs in `public/scenes/photos/`. Contrast ratios below are computed (WCAG 2.x relative luminance) from the actual hex values in the Tailwind config.

---

## Verdict

**Grade: B−** — excellent interaction design wearing an unfinished visual identity.

The *behavioral* design of this app is genuinely best-in-class for its category: one tap from open to audio, no onboarding, no interstitials, an auto-engaging pure-black Nightstand mode with two-tap stop protection, colorblind-aware status labels, a global reduced-motion override, and copy that reads like a quiet friend ("8-second fade. Tap Stop and walk away."). Endel and Calm both make you work harder to fall asleep than this does.

The *visual* execution drifts. The single most important ingredient of "Midnight Editorial Minimalism" — the editorial serif — **is not actually in the app**: `font-serif` declares EB Garamond / Cormorant Garamond, but no serif font file is shipped or loaded, so every heading renders in whatever the OS coughs up (Georgia on iOS, Noto Serif on Android, anything on Linux). Three of eight photographs are off-brief, including one that is precisely the "loud wellness iconography" the brief forbids. And the two most-used secondary text colors fail WCAG AA on the app's own backgrounds. None of this is structural; all of it is fixable in days. The bones are A-grade. The skin is a C+. Net: **B−**, with a short path to A−.

---

## The Sleepy-User Test

*Scenario: it's 11:40pm, lights off, phone at 10% brightness, user is half-asleep.*

**Taps from open → asleep: 1.** This is the headline achievement. Cold open lands on Tonight (`App.tsx` deliberately does not restore last-visited screen — correct call, documented in a comment). The last-played scene is sorted to the top as the big card (`TonightScreen.tsx:105-111`). One tap: fullscreen is requested synchronously inside the gesture, audio unlocks, scene fades in over the first-start fade, Player appears. After 30 seconds idle, the screen crossfades to pure black Nightstand mode over 1800ms. The user never has to do anything else. If a default timer is set in Settings, it auto-arms on every scene start. Compare: Calm is 3–5 taps through a content mall; iOS Bedtime requires Shortcuts gymnastics to get ambient audio at all. **This flow is better than the commercial competition.**

Specific strengths:

- **No "Begin" interstitial.** The tap that picks the scene *is* the Web Audio unlock gesture. The comment trail in `App.tsx`/`TonightScreen.tsx` shows this was fought for. Worth it.
- **"Surprise me"** is exactly the right affordance for decision-fatigued users, and it correctly excludes the current/last scene from the pool.
- **Accidental-touch protection is well thought through.** In Nightstand, the controls are `opacity-0 pointer-events-none` until a wake tap; Stop requires *wake tap → then Stop tap* (`PlayerScreen.tsx`, `NightstandOverlay`). A face-plant on the phone in the dark cannot kill the audio. The back button is hijacked so it can never exit the app and kill playback (`App.tsx:111-131`). Pull-to-refresh is disabled at every level (`index.css`). Pinch-zoom is deliberately left enabled with an a11y comment. This is grown-up engineering in service of sleep.
- **Stop semantics are honest.** Pause on the lock screen means stop, because pausing an ambient scene is meaningless — and the comment explains why both buttons are still registered (Android launchers). Good.

Weak spots in the sleepy path:

1. **`WAKE_DURATION_MS = 3_000` is too short.** A sleepy person taps the black screen, dim controls fade in at 40% opacity, and they have *three seconds* to find and hit Stop before it all fades away again. Groggy motor control plus 40%-opacity targets needs 6–8 seconds minimum. This will produce real 2am frustration-taps.
2. **The Lush player's Stop button is a 128px warm-orange disc in the center of the screen** (`bg-ember-500`, `w-32 h-32`). Two issues: (a) for the first 30 seconds before Nightstand engages, it is the largest unprotected touch target on screen and it kills the session in one tap; (b) aesthetically, the brightest, warmest, most saturated object in the entire app is the *destructive* action on the screen you stare at while falling asleep. The visual hierarchy says "the point of this screen is to stop." Endel's equivalent surface makes the *session* the hero and tucks stop away. Consider: smaller Stop, or require the same two-step confirm as Nightstand, and let the scene photo/title be the hero.
3. **Photo brightness at night is uncontrolled.** The card overlay was deliberately lightened to 25/45/85% (`sceneBackground.ts:33-38`) — fine for the dark photos, but the **Monsoon** photograph has a near-white sky occupying half the frame. At 2am, full-brightness-white through a 25% scrim is a flashlight. There is no per-photo luminance compensation. (See Photography section.)
4. **Idle-timer events include `mousemove`** (`PlayerScreen.tsx:89`) — harmless on phones, but on a laptop the screen may never reach Nightstand if the trackpad twitches. Minor.

---

## Visual Design & Brief Adherence

### Where it nails the brief

- **The palette is real design work, not a default dark theme.** Ink is warm (the 950 is `#0B0D10`, a blue-black, but the stones are genuinely warm parchment tones), the moon sage `#9BB7AE` is restrained and used sparingly as instructed, and ember is reserved for warmth/errors/stop. Nothing in the named palette is a Tailwind stock color. The `theme-color`, pre-mount `background-color`, and `ScreenFallback` all match `#0B0D10` so there is never a white flash — "flashes wake people up" is even written in the CSS comment. This is brief-literate work.
- **Motion has a point of view.** `ease-exhale` (`cubic-bezier(0.22,0.61,0.36,1)`), 900ms/1600ms durations, the 1800ms Nightstand crossfade annotated "slow enough to feel like an exhale rather than a UI transition." `active:scale-[0.985]` on cards. This is the editorial sensibility the brief asked for, expressed in time instead of pixels.
- **The copy is the most editorial thing in the app.** "A place to land at the end of the day." / "Pick up where you left off, or try something new." / "A daytime activity. Try again after 6am." (the bedtime gate on story generation — a *beautiful* piece of product self-discipline) / "No accounts. No telemetry. No notifications. Ever." The scene descriptions read like field notes ("a bass rumble miles off"). If the visual identity matched the verbal identity, this would be an A.
- **Photography, not illustration** — honored. No illustrations, no gradients-as-content, no lotus icons in the main flow.
- **One accent, used sparingly** — honored. Moon-300/600 appears only on active nav, primary CTAs, and the "Begin →" affordance.

### Where it drifts into generic-dark-mode-app

1. **The serif is a ghost.** `tailwind.config.js` declares `serif: ['"EB Garamond"', '"Cormorant Garamond"', 'Georgia', 'serif']`, but the only `@font-face` in the app is Inter (`index.css:20-26`; `public/fonts/` contains only `InterVariable.woff2`). Neither Garamond is bundled, preloaded, or fetched. **Every `font-serif` heading in the app is rendering the third or fourth fallback.** On iOS that's Georgia (acceptable but not the design); on Android there is no Georgia, so headings render Noto Serif — a face with completely different proportions and zero editorial intent. The signature element of "Midnight Editorial Minimalism" is currently a system-font lottery. Self-hosting an EB Garamond subset (latin, 400 + 500, ~40–60 KB woff2, same offline-first treatment as Inter) is the single highest-leverage visual fix in this codebase.
2. **Unicode-glyph iconography is inconsistent with the drawn icons.** The nav uses clean 1.5px-stroke SVGs (moon/book/gear — well drawn, appropriately quiet), and ContentPlayer has proper play/pause/replay/spinner SVGs. But the rest of the app uses keyboard glyphs: `▸`/`▾` for the mixer disclosure, `■ Stop`, `×` for delete, `✓`/`●` in the generator progress, `▸` as a timer prefix. The text arrows (`Begin →`, `← Scenes`) actually *work* as an editorial gesture — they read like a magazine TOC — but the geometric glyphs (`▸ ▾ ■ ●`) read as developer placeholder. Pick a side: either all text-glyph (and choose typographically — `›`, `‹`, en-dashes) or all drawn.
3. **Developer surface leaks into the bedroom.** A "Dev tools" button sits in the Tonight footer of the shipped UI; the Library empty state tells the user to run `npx tsx tools/gen-meditation.ts`; Settings shows a monospace build hash. For a personal app this is defensible — but it is exactly the kind of thing that breaks the spell the rest of the app works so hard to cast. At minimum gate "Dev tools" behind a long-press.
4. **Gutter inconsistency:** Tonight/Library/Settings use `px-5`; Player/ContentPlayer/StoryGenerator use `px-6`. Header bottom margins wander (`mb-6`, `mb-7`, `mb-8`, `mb-10`) without an evident scale. Nobody will consciously notice; everyone will subconsciously feel the screens are siblings rather than the same person. Pick one gutter and a 3-step header rhythm.
5. **Off-palette colors in Settings:** `text-red-400` (Tailwind stock red — twice, for offline errors) where every other error in the app is `ember-400`; `placeholder-ink-400` references an ink shade that **does not exist** in the config (ink stops at 500), so the class silently no-ops and the API-key placeholder renders at the browser default. Both are five-minute fixes; both are the kind of drift that separates "designed" from "themed."

### Photography — judged as a set

Viewed all eight at full size. The set is **half excellent, half off-brief**, and the inconsistency is visible on the Tonight screen where they sit in a column together.

| Photo | Verdict |
|---|---|
| **ocean-night** | **The best image in the app.** Moonlit long-exposure surf over rocks, deep blue hour, a literal moon — this *is* Midnight Editorial Minimalism. If the whole set matched this, the Tonight screen would be beautiful. |
| **rain-on-window** | Excellent. Bokeh city rain, warm amber against deep blue, genuinely cinematic. Second-best image. |
| **forest-night** | Good. Stars through canopy, very dark, on-palette. Slightly muddy/noisy at the leaf edges (looks like a phone long-exposure) but the darkness is right. |
| **forest-evening** | Good. Wet pine boughs in blue-green mist, dark and atmospheric, on-palette. |
| **fireplace** | Serviceable but generic — a stock close-up of flames, loud orange against black. It's the most saturated card in the column and slightly mall-screensaver. A dimmer ember-and-coals image would sit better at night. |
| **monsoon** | A genuinely good storm photograph that is **wrong for this app**: high-key daylight, and the right third of the frame is blown to near-white. Behind a 25%-opacity scrim at the top of the card, this is the brightest object in the entire UI — at 2am it's a flashlight. Needs a darker grade, a heavier per-photo scrim, or replacement with a night storm. |
| **forest-day** | **Weakest image.** A daytime snapshot of a park path — with a passer-by in the background and a red building. It reads as a camera-roll photo, not an editorial selection. The brief says photography, but it means *art-directed* photography; this is neither midnight nor editorial. |
| **singing-bowl** | **Direct brief violation.** Buddha statue + singing bowl + bright red felt mallet is the most clichéd wellness stock photo that exists — this is precisely the "loud wellness iconography" the brief explicitly bans, with a saturated red accent the palette doesn't contain. The *scene* is great; the photo must go. A dark, abstract close-up of bowl bronze (rim highlight on black) would keep the subject and lose the cliché. |

A second-order issue: the set has no consistent *grade*. ocean-night/forest-evening are cold blue; fireplace is hot orange; forest-day is neutral daylight; rain-on-window is teal-amber. Best-in-class sets (Endel's scene art, Portal's environments) run every asset through one tonal treatment so the catalogue feels authored. A single Lightroom-style grade (crush blacks toward `#0B0D10`, desaturate highs, cap luminance) applied to all eight would unify the set in an afternoon.

---

## Typography & Color

### Type system

- **The 16px body floor is engineered, not just promised:** `.body-text` (16px/1.65) vs `.ui-label` (14px) with usage rules documented in `index.css:5-10`, and `fontSize.base` overridden to exactly `['16px', {lineHeight:'1.65'}]`. Genuinely good system thinking.
- **But the floor is violated where it matters:** secondary scene cards on Tonight render their *descriptions* — text the brief's own definition says users "actually read" — in `ui-label` 14px (`TonightScreen.tsx:258`, `primary ? 'body-text' : 'ui-label'`). Voice descriptions in the story generator, the bedtime note, and Library meta also carry reading content at 14px. And the "last played" tag and bottom-nav labels are `text-xs` (12px) — legal under the "nothing below 12px" rule, but 12px *uppercase tracking-widest* at `stone-400` over a photograph is a strain for a rested reader, let alone a sleepy one.
- **Serif/sans pairing:** as noted above, the pairing is currently *Inter + unloaded fantasy*. Inter itself is well deployed (variable font, preloaded, self-hosted, `font-display: swap`, antialiased). When the serif lands, watch the scale: serif `text-4xl` page titles over serif `text-3xl` card titles works; the `text-lg` serif card titles in Library will need the real Garamond's larger x-height sizes checked at 18px, where Garamonds get thin.
- **Hierarchy is otherwise disciplined:** h1 (4xl serif) → h2 section (lg–3xl serif) → body 16 → meta 14/12. Settings' serif section headers at `text-stone-300 text-lg` are a nice quiet register.

### Computed contrast ratios (WCAG 2.x, from actual hex values)

Against `ink-950 #0B0D10` (the app background):

| Token | Hex | Ratio | AA (4.5) | Used for |
|---|---|---|---|---|
| stone-50 | `#F4EFE8` | **17.01** | pass | headings |
| stone-100 | `#E6DFD3` | **14.70** | pass | primary body |
| stone-200 | `#CFC6B6` | **11.49** | pass | input text |
| stone-300 | `#A89E8C` | **7.35** | pass | labels |
| moon-300 | `#9BB7AE` | **9.06** | pass | accent text |
| ember-400 | `#C9A187` | **8.28** | pass | errors |
| **stone-400** | `#7B7264` | **4.11** | **FAIL** | nearly all secondary/description text |
| **stone-500** | `#544D43` | **2.33** | **FAIL (badly)** | nav labels, Library meta, delete ×, footer |

On `ink-800 #161A22` cards (Library content cards, panels):

| Pair | Ratio | Verdict |
|---|---|---|
| stone-400 on ink-800 | **3.68** | FAIL — Library card descriptions |
| stone-500 on ink-800 | **2.09** | FAIL — Library meta lines ("12 min") |
| stone-300 on ink-800 | 6.58 | pass |

Buttons:

| Pair | Ratio | Verdict |
|---|---|---|
| stone-50 on moon-600 (primary CTAs) | 4.76 | pass AA |
| ink-950 on moon-500 | 5.05 | pass |
| ink-950 on ember-500 (Stop disc) | 5.62 | pass |
| moon-300 on ink-700 (timer chips) | 7.33 | pass |

**The pattern:** everything the designer considered "primary" passes comfortably; everything labeled "secondary" was dimmed past the legal floor. `stone-400` is the workhorse for scene descriptions, status lines ("Stops in 12:00"), hints, and the Tonight subtitle — all 16px reading text at 4.11:1, and *worse* over photographs where the scrim is lighter than ink-950. `stone-500` at 2.33:1 carries the inactive nav labels at 12px — a double violation. The fix is mechanical: promote reading-text uses of stone-400 → stone-300 (7.35:1, still visibly "muted"), and stone-500 → stone-400 for true decoration only. The palette already contains the compliant steps; the usage just reaches one step too dim.

(Counterpoint considered: dimness is a feature in a sleep app. But the right dimming lever is the photo scrim, OS brightness, and Nightstand mode — not sub-AA text that the user must *succeed at reading* to operate the timer.)

---

## Screen-by-Screen Notes

### Tonight (`TonightScreen.tsx`)
The right screen, correctly first. Hero card for last-played with `Begin →` in moon-300, quieter siblings below, "Surprise me" as a text button, real skeleton loaders, inline error state with calm wording. Critiques: secondary-card descriptions at 14px (above); "last played" 12px/stone-400 over photo; the busy state swaps `Begin →` for `Loading…` but also `disabled:opacity-40`s every *other* card, which makes the whole screen visibly throb on a slow network — dimming the non-chosen cards is enough without opacity-dropping the chosen one's siblings *and* keeping them in the layout shimmer; "Dev tools" in the footer (gate it). The header subtitle switching between first-run and returning copy is a lovely touch.

### Player (`PlayerScreen.tsx`)
The most considered screen in the app. Timer chip with four states, each carrying a *text* label with color only as reinforcement (the code comments note the user is colorblind — this is personal-context-aware design of the best kind). Photo continuity from card to player via shared `sceneBackground.ts` with a documented heavier scrim. Critiques: the giant ember Stop disc dominating the hierarchy (above); "Nightstand mode" as a 14px stone-400 text button is the *most sleep-relevant control on the screen* rendered as its least visible element — it deserves promotion; the timer picker offers only 15/30/60/90 with no "until I stop it" label (the off state is implicit — fine, but a sleepy brain benefits from explicitness); mixer disclosure `▾`/`▸` glyphs. The status line ("Stops in 12:34" / "Fading out…" / "Playing") is exemplary state communication.

### Nightstand overlay (`NightstandOverlay`)
**The most beautiful thing in the app, and it's an interaction, not a pixel.** Auto-engages after 30s idle; 1800ms crossfade to true `#000` (correctly bypassing ink-950 — on OLED this is pixels-off); tap reveals controls at 40% opacity for the scene name, timer countdown, Stop, and "Lush mode"; second tap required to stop; re-requests fullscreen opportunistically on each wake tap because each tap is a fresh user gesture. `aria-hidden` is correctly flipped between the layers. This is what iOS StandBy wishes it did for audio apps. Two flaws: the 3s wake window (above), and `role="main"` on the overlay div while the real `<main>` still exists — two mains in the accessibility tree.

### Library (`LibraryScreen.tsx`)
Competent, least editorial screen — ink-800 cards with title/description/meta and inline Play/Delete affordances; this is where the app looks most like a generic dark-mode list. Inline two-step delete confirm (Cancel/Delete swap in place) is good practice. The bedtime gate on story generation with its italic note is *chef's kiss* product thinking. Critiques: meta lines at stone-500/2.09:1 on cards; empty state surfaces a CLI command; the `×` delete glyph is a 14px target visually (44px box, fine functionally); tabs are 14px `capitalize` — would happily be 16px; stories vs meditations tab state is not persisted (returns to meditations every visit — correct default, arguably).

### ContentPlayer (`ContentPlayerScreen.tsx`)
Proper SVG transport icons (the only screen with them), loading/ready/playing/paused/ended/error states all handled, seek bar with `aria-valuetext`, monospace timestamps, background-bed attenuation slider with persisted setting. Critiques: the screen ignores the scene-photo continuity system — flat ink-950 even when a bed scene is running (the `sceneBackground` treatment stops at PlayerScreen; carrying the bed scene's photo here would unify the world); "% complete" as the playing status is an oddly quantitative voice for this app ("12 minutes left" is the sleepy phrasing); no error-retry affordance beyond pause/play.

### StoryGenerator (`StoryGeneratorScreen.tsx`)
Daytime screen, judged by daytime rules, and it holds up: labeled inputs, voice picker as full-width rows with descriptions, native `<select>` for the bed scene (pragmatic, if visually plain), cost transparency before the CTA, live step log with ✓ marks, wake-lock during generation plus an honest "keep your screen on" hint, dedup guard with a human message ("Already generating that one. Give it a moment."), and error copy that maps failure modes to user actions. The `✓`/`●` glyph progress would be better as the drawn-icon language. The Cancel button being right-aligned and quiet while a 2–5 minute spend is in flight is the correct hierarchy.

### Settings (`SettingsScreen.tsx`)
Well-sectioned (Playback / Offline / AI / Diagnostics / About) with serif section heads and clear prose. Default-timer chips use `aria-pressed`. Offline panel: status, determinate progress bar, cancel, SW-not-controlling explanation — full state coverage that most production apps skip. Critiques: `text-red-400` off-palette (twice); phantom `placeholder-ink-400`; the unencrypted-key warning is honest and well-worded; Diagnostics is the most utilitarian UI in the app (acceptable — it's a debugging surface); "Consider rotating quarterly" is a strangely corporate sentence in this voice.

### Bottom nav (`App.tsx`)
Three tabs, 56px tall, stroke icons, hidden on immersive screens — all correct. Inactive labels: 12px at stone-500 = 2.33:1, the single worst legibility datum in the app. Active moon-300 with `aria-current="page"` — good. No haptic/visual press feedback beyond color; acceptable.

---

## Accessibility

**Strong (unusually so for a personal project):**
- Pinch-zoom deliberately **not** disabled, with a WCAG citation in the HTML comment (`index.html:5-6`).
- Global `prefers-reduced-motion` kill-switch for all animation/transitions (`index.css:107-116`), explicitly scoped to visual motion only.
- Color never carries state alone — timer chip and Nightstand status pair every color with a text label, documented as designed-for-colorblindness (`PlayerScreen.tsx:618-622`).
- `aria-label` on every icon/ambiguous button, `aria-pressed` on toggles, `aria-current` on nav, `role="alert"`/`role="status"` on errors and async status, `aria-valuetext` on every slider, `aria-hidden` correctly swapped between Lush and Nightstand layers, decorative SVGs all `aria-hidden`.
- Body text floor + 44px minimum enforced via inline `minHeight: 44` on effectively every interactive element (verified across all six screens; nav is 56px; the few `minWidth` omissions — timer chip, "Surprise me" — are padded wide enough in practice).

**Gaps:**
1. **Contrast failures** as computed above — stone-400 (4.11:1) for reading text, stone-500 (2.33:1) for nav labels and meta. This is the only *systemic* a11y problem.
2. **No designed focus state.** Buttons rely on the UA default focus ring (never removed — so keyboard users get *something* — but an unstyled blue/white ring on this palette is jarring). Only text inputs get `focus:border-moon-600`. A `focus-visible:ring-moon-400/60` utility applied app-wide would cost an hour. Keyboard use is rare in bed but real for the laptop case the code elsewhere supports.
3. **Slider thumbs are 24px** with a 4px track — well under the 44px touch floor that everything else honors, and sliders (master volume, seek, bed attenuation) are primary in-bed controls. Invisible padding via larger hit area (or a taller track) is needed.
4. **Two `main` landmarks** when Nightstand is engaged (`role="main"` on the overlay inside `<main>`).
5. **`user-select: none` globally** — app-like, but it also blocks selecting error messages to copy them; minor tension with the diagnostics-sharing flow.
6. Skeleton `animate-pulse` and spinner correctly fall under the reduced-motion kill-switch — verified, no exemption needed.

---

## Ranked Fix List

### Must-fix before ship
1. **Ship the serif.** Self-host an EB Garamond subset (400/500, latin, woff2) exactly like Inter — `@font-face`, preload, offline-cached. Until this lands, the design language's signature element does not exist on Android at all. (`index.css`, `public/fonts/`, `tailwind.config.js`.)
2. **Fix the two failing text colors.** Promote reading-text uses of `stone-400` → `stone-300`; reserve `stone-400` for decoration; replace `stone-500` text on nav/meta with `stone-400`+. Mechanical find-and-replace by role, ~20 call sites. (All screens.)
3. **Replace the singing-bowl photo** (Buddha + red mallet = the banned wellness cliché) **and the forest-day photo** (daylight snapshot with a pedestrian). Replace or aggressively darken **monsoon** (near-white sky = 2am flashlight). The ocean-night image is the quality bar.
4. **Lengthen the Nightstand wake window** from 3s to ~7s, and consider 60–70% opacity for woken controls instead of 40%. One constant + one class. (`PlayerScreen.tsx:36`, overlay classes.)
5. **Secondary scene-card descriptions to 16px** — they are reading text under the app's own rule. (`TonightScreen.tsx:258`.)

### Should-fix
6. **Demote the Lush Stop disc** (size and/or saturation) and **promote "Nightstand mode"** — the destructive action is currently the hero of the pre-sleep screen and the sleep-mode entry is its footnote. (`PlayerScreen.tsx`.)
7. **Unify error/placeholder tokens in Settings:** `text-red-400` → `text-ember-400`; fix phantom `placeholder-ink-400` → `placeholder-stone-500` (and check its contrast on ink-800). (`SettingsScreen.tsx`.)
8. **Per-photo scrim or one global tonal grade** for the photo set (crush blacks to `#0B0D10`, cap highlight luminance) so all eight cards sit in one world and no card can be bright at night. (`sceneBackground.ts` or asset pipeline.)
9. **Add a designed `focus-visible` style** (moon-400 ring) app-wide; **enlarge slider hit areas** to ≥44px effective. (`index.css`.)
10. **Gate "Dev tools"** behind a long-press or build flag; remove the CLI command from the Library empty state ("Generate one from the Stories tab" instead). (`TonightScreen.tsx`, `LibraryScreen.tsx`.)
11. **Carry the bed scene's photo background into ContentPlayerScreen** for world-continuity with Player. (`ContentPlayerScreen.tsx`.)

### Polish
12. Normalize gutters (`px-5` vs `px-6`) and header spacing to one rhythm across the six screens.
13. Replace `▸ ▾ ■ ● ✓ ×` keyboard glyphs with either the drawn-icon language or deliberate typographic characters; keep the `→`/`←` text arrows — they're working.
14. Reword "% complete" in ContentPlayer to time-remaining phrasing; consider "until you stop it" label for the timer-off state.
15. Remove `role="main"` from the Nightstand overlay; drop `mousemove` from the idle-timer event list (or keep for laptop, but then add `wheel`).
16. Library meta lines: one step lighter, or fold meta into the description line to reduce the three-deck card stack.

---

*Bottom line: the interaction layer already understands what a sleep app is better than most shipping competitors. Spend one focused week on the visual layer — real serif, two color promotions, three photographs, one scrim pass — and this moves from "thoughtfully engineered dark app" to the Midnight Editorial object the brief describes.*
