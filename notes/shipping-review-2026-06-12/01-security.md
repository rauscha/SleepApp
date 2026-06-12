# Security review — SleepApp pre-v1.0

**Reviewer:** automated senior appsec pass · **Date:** 2026-06-12 · **Scope:** full
`src/`, `public/sw.js`, `index.html`, `vite.config.ts`, scene/story/meditation
JSON, CI workflows, git history (all 56 commits), npm dependency tree.

## Verdict

**Not a ship blocker. Ship it.** For the stated threat model — a personal,
single-user, static client-side PWA with bring-your-own API keys — the security
posture is unusually good for a hobby project: a real CSP that pins
`connect-src` to exactly the two API origins, no `dangerouslySetInnerHTML` /
`innerHTML` / `eval` anywhere, a conservative same-origin GET-only service
worker that only caches 200s, a thorough `.gitignore` for secrets, a clean git
history (no key material ever committed), zero production-dependency
vulnerabilities, and a deploy pipeline that deliberately refuses to bake API
keys into the public bundle. The findings below are hardening items, with one
Medium-severity cluster around the *local dev/build* path for env-var keys
that deserves a fix before the habit calcifies.

One important context note discovered during review: this app is **publicly
deployed** to GitHub Pages (`andrewrausch.com/SleepApp/`, see
`.github/workflows/deploy.yml`). "Personal single-user" describes the usage,
not the hosting — anyone can load the app. That works only because the
deployed bundle contains no secrets and all state is client-local. The
findings are calibrated against that reality.

---

## Critical

None.

## High

None.

## Medium

### M1 — Build-time env API keys are baked into any bundle Vite produces, and the dev server is network-exposed

**Where:**
- `src/storage/apiKeys.ts:17-29` — `getAnthropicApiKey()` / `getElevenLabsApiKey()`
  prefer `import.meta.env.VITE_ANTHROPIC_API_KEY` / `VITE_ELEVENLABS_API_KEY`.
- `.env.example:17-22` — template invites putting live keys in `.env.local`.
- `vite.config.ts:136,144` — dev server binds all interfaces when
  `VITE_USE_HTTPS=1` (`host: true`) and allows `.ts.net` / `.local` hosts; the
  documented dev path fronts it with `tailscale serve` so every device on the
  tailnet can fetch the dev bundle.
- `npm audit`: `esbuild <=0.24.2` via `vite@5.4.11` —
  [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
  (moderate): the dev server can be induced to answer cross-origin requests,
  letting *any website open in a browser on the same machine/network* read
  dev-server responses — i.e. read the served source, **including the inlined
  `VITE_*` key values** when `.env.local` is populated.

**Why it matters:** Vite inlines every `VITE_*` value as a string literal into
the JS it serves/builds. With keys in `.env.local`, three exposure paths exist:

1. The known esbuild/Vite dev-server CORS weakness above — drive-by key read
   while `npm run dev` is running.
2. Any tailnet device (or LAN device under `VITE_USE_HTTPS=1`) can read the
   dev bundle. Tailnet is semi-trusted but is a wider boundary than "this
   machine".
3. Human error: a local `npm run build` with `.env.local` present produces a
   `dist/` containing live keys; if that dist is ever uploaded anywhere
   (manual Pages push, sharing a build with a friend), the keys are public.
   The CI deploy correctly omits keys (`deploy.yml` even documents why), but
   nothing stops the local-build footgun, and `build.sourcemap: true` makes
   recovery of the inlined key from a shipped bundle trivial.

**Fix (concrete):**
1. Gate the env-key path to dev only in `apiKeys.ts`:
   ```ts
   const allowEnvKeys = import.meta.env.DEV;
   export function getAnthropicApiKey(): string | null {
     return (allowEnvKeys ? envValue(import.meta.env.VITE_ANTHROPIC_API_KEY) : null)
       ?? getSetting('anthropicApiKey');
   }
   ```
   This makes a key-bearing *production* build structurally impossible while
   keeping the dev convenience. (Alternatively: drop the env path entirely and
   paste keys into Settings once per browser — the localStorage path already
   works.)
2. Upgrade Vite past the esbuild advisory when convenient (Vite 6/7 — dev-only
   risk, so this can ride a normal maintenance window, but do it).
3. Keep ElevenLabs/Anthropic keys on spend-capped accounts and rotate
   periodically (the Settings UI already suggests quarterly — good).

### M2 — API keys at rest in plaintext `localStorage`

**Where:** `src/storage/settings.ts:14,36-37` (keys live inside the
`sleep-app:settings:v1` blob); entered via `src/screens/SettingsScreen.tsx:149-164`.

**Why it matters:** `localStorage` is readable by any script that ever runs in
the origin (XSS), by browser extensions with host permissions, by anyone at
the unlocked device, and by anything that can read the browser profile on
disk. There is no XSS vector in the current code (see I1) and the CSP
meaningfully shrinks the blast radius of a future one, but the keys are the
single most valuable asset in the app and they sit unencrypted.

**Honest calibration:** for a client-only app there is no place to hide a
secret that survives a same-origin script compromise — encrypting with a key
held in the same origin is obfuscation, not protection. The current design
(plaintext + explicit UI warning at `SettingsScreen.tsx:144-147` + direct-only
egress enforced by CSP `connect-src`) is a reasonable, honest trade-off.
Accepted risk; recorded here so it's a *decision*, not an accident.

**Fix (optional hardening):** wrap the keys with WebCrypto AES-GCM using a
non-extractable key stored in IndexedDB. This does not stop a live XSS but
does stop casual disk/backup/`JSON.stringify(localStorage)` disclosure, and
keeps keys out of any future "export all settings" feature. Also consider
holding keys under a dedicated storage key rather than inside the general
settings blob, so a future settings export/sync can't accidentally include
them (`getAllSettings()` at `settings.ts:135-137` already returns them today —
nothing currently exports it, but it is one `JSON.stringify` away).

## Low

### L1 — CSP is meta-tag-only; `frame-ancestors` there is a no-op

**Where:** `index.html:25-28`.

The policy itself is good (no `unsafe-eval`, `script-src 'self'`, pinned
`connect-src`, `object-src 'none'`). But per spec, `frame-ancestors` (and
`sandbox`/`report-uri`) are **ignored when delivered via `<meta>`** — so the
intended clickjacking protection is not actually in effect, and a meta CSP
only applies from the point the parser reaches it. GitHub Pages cannot set
response headers, so this is a platform limitation, not a code bug.

**Impact is genuinely low here:** there are no authenticated, state-changing
UI actions worth clickjacking, and the API keys are not reachable via framing.

**Fix:** none possible on Pages beyond what's done. If hosting ever moves
(Cloudflare Pages / Netlify / any host with `_headers` support), promote the
exact same policy to a real `Content-Security-Policy` header and add
`X-Frame-Options: DENY` / working `frame-ancestors 'none'`. Worth a note in
`DECISIONS.md`.

### L2 — Source maps shipped to the public deploy

**Where:** `vite.config.ts:166` (`sourcemap: true`), deployed by
`deploy.yml` (whole `dist/` is uploaded).

Full original TypeScript is recoverable by anyone from the public site. If
the repo is public anyway this discloses nothing new; the real cost is that
it converts any *accidental* secret in the bundle (see M1) from
"needle in minified haystack" to "readable file". Keep sourcemaps if you value
field debugging (legitimate for the overnight-crash work); just be aware it
raises the stakes on M1. Alternative: `sourcemap: 'hidden'` keeps the maps out
of browser devtools pointers while still producing them locally.

### L3 — Diagnostics log captures arbitrary error/rejection strings and is designed to be shared

**Where:** `src/diagnostics/lifecycleLog.ts:181-197` (captures
`ErrorEvent.message` and rejection reasons, truncated to 200 chars);
`formatAsText()` (`lifecycleLog.ts:97-116`) embeds `navigator.userAgent`;
Share/Copy/Download UI at `SettingsScreen.tsx:342-449`.

Today no code path puts a key into an error message — `storyGenerator.ts`
error strings embed only `res.status` and a 200-char slice of the *response*
body, never request headers. But the log is a sink that will faithfully
record whatever future errors contain, and its whole purpose is to be pasted
into chat/email. The UA string is mild device fingerprinting, disclosed
knowingly.

**Fix:** cheap insurance — scrub in one place before persisting:
```ts
const SECRET_RE = /\b(sk-ant-[A-Za-z0-9-_]{8,}|sk_[A-Za-z0-9]{16,}|xi-api-key)\S*/g;
detail = detail?.replace(SECRET_RE, '[redacted]');
```
in `recordEvent()` (`lifecycleLog.ts:64`). Five lines, closes the class.

### L4 — Failed-TTS path logs the full story script to the console

**Where:** `src/services/storyGenerator.ts:792`
(`console.error('ElevenLabs synth failed — preserving script:', text)`).

Deliberate and documented (script recovery after paid generation). The script
is user-prompted creative output, not a secret, and console output stays in
devtools. Fine for the threat model — just keep the invariant that **keys are
never logged** (true today; verified every `console.*` call site in `src/`).

### L5 — Dev/preview server reachable beyond localhost by design

**Where:** `vite.config.ts:125-163`, `start-dev.bat` (tailscale serve on 443).

The default dev path binds localhost-only and lets tailscaled do the
exposure — good design, and `allowedHosts` is a scoped list rather than
`true`. Residual risk is "anyone on the tailnet is me"-grade trust plus the
esbuild advisory (M1). No change needed beyond M1's fixes; flagged so the
exposure is a recorded decision.

## Informational

### I1 — XSS / injection review: clean

- No `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, or
  `new Function` anywhere in `src/` (verified by grep).
- All LLM-derived strings (Claude's `<title>` → `StoryMetadata.title`, theme,
  error bodies) are rendered exclusively through React JSX text nodes
  (`LibraryScreen.tsx:340,391`, `ContentPlayerScreen`, `StoryGeneratorScreen.tsx:355`),
  which auto-escape. The generated *script* text is stored in IndexedDB but
  never rendered to the DOM at all.
- Scene/story/meditation JSON from `public/` is same-origin static content;
  fields flow into JSX text and `fetch()` URLs composed via
  `resolvePublicUrl()` (`src/lib/baseUrl.ts`) — same-origin paths only, and
  CSP `connect-src 'self' …` would block an exfil URL even if a scene file
  were tampered with.
- The only HTML-ish injection into third-party input is the
  `<break time="2.5s" />` SSML tag added in `stripStoryMarkers()`
  (`storyGenerator.ts:613`) — sent *to* ElevenLabs, not rendered.

### I2 — Service worker: well designed

`public/sw.js` ignores non-GET (`:111`) and cross-origin (`:114`) requests, so
API calls (with key headers) are never intercepted or cached. All three cache
strategies only store `res.ok && status === 200` (`:160,171,191`), excluding
opaque responses and 206 partials. No `skipWaiting()` (deliberate,
documented). The `message` handler (`:96-107`) only answers `{type:'ping'}`
with a timestamp — no command surface, no cache manipulation via postMessage.
Scope is the deploy base; registration at `main.tsx:38` is production-only.
Cache poisoning would require same-origin HTTPS response compromise, which is
upstream of the SW. No action needed.

### I3 — Git history and working tree: no secrets

- Scanned every commit (56) for `sk-ant-api…` / `sk_<hex>` patterns: nothing.
- `.env*` history shows only the empty `.env.example` template was ever
  committed (`VITE_…_API_KEY=` with no value).
- `.gitignore` is notably thorough about key-bearing files (`.env.*`,
  `*.secret.txt`, `Untitled*.txt`, `*.gdoc`, `*.pem`, `elevenlabs.txt`,
  `anthropic.txt`, `certs/`).
- ElevenLabs **voice IDs** committed in `deploy.yml:` env block are correctly
  judged non-secret (opaque identifiers, useless without a key).

### I4 — Dependency posture

`npm audit --omit=dev`: **0 vulnerabilities** (prod deps are just
react/react-dom/howler). Dev tree has the esbuild/vite moderate advisory
covered in M1. Howler 2.2.4 is current. Dependency count is admirably small.

### I5 — Data at rest inventory (what a device thief gets)

- `localStorage`: settings blob incl. **API keys (M2)**, lifecycle log
  (timestamps, event kinds, UA, truncated error strings), last scene id.
- IndexedDB `sleep-app`: story metadata **including full scripts and themes**,
  story audio (WAV/MP3 blobs).
- Cache Storage: ~290 MB public audio assets (non-sensitive).
Everything except the keys is low-sensitivity personal content. Matches the
"no telemetry, nothing leaves the device" claim in Settings — that claim was
verified: the only network egress in the app is same-origin asset fetches plus
the two CSP-pinned API origins.

### I6 — Prompt injection

The user's theme is interpolated into the Claude prompt
(`storyGenerator.ts:714`). The only "attacker" is the user attacking their own
API key with their own input. Not a finding; noted for completeness if shared
themes ever become a feature.

---

## If this ever goes public (multi-user / promoted beyond personal use)

The architecture is already closer to public-ready than most personal apps
(BYOK, no server, CSP), but the threat model would shift:

1. **M1 becomes Critical.** The env-key code path must be deleted, not gated —
   one CI misconfiguration away from shipping a paying key to every visitor.
   `hasAnthropicEnvKey()` UI affordances go too.
2. **Key storage warrants real treatment** — at minimum WebCrypto-wrapped at
   rest, ideally a tiny key-proxy backend (the Anthropic
   `dangerous-direct-browser-access` header is explicitly a personal-app
   escape hatch, and ElevenLabs keys are full-account credentials with no
   scoping).
3. **Headers, not meta:** move to a host that can serve a real CSP header,
   `frame-ancestors`, `Strict-Transport-Security`, `X-Content-Type-Options`,
   and a `Permissions-Policy`.
4. **Abuse/cost surface appears:** the generator UI would be driving *other
   people's* spend — rate limiting, per-key budget warnings, and clearer cost
   consent become product requirements.
5. **Shared content changes I1/I6:** if generated stories/scenes are ever
   shared between users, LLM output and scene JSON become *untrusted* input —
   re-review every render and URL-composition site, validate scene JSON
   against a schema, and treat scripts as hostile text.
6. **Privacy posture needs paper:** lifecycle log (UA, timestamps) and
   IndexedDB contents would need a privacy note; the diagnostics share flow
   should scrub by default (L3 fix).
7. **Dependency/process hygiene:** re-enable `npm audit` in CI (it's currently
   `--no-audit` in both workflows), pin actions by SHA, and consider
   `npm ci` with a cross-platform lockfile so CI builds are reproducible.
