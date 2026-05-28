# Reaching the dev server from a phone

The dev server runs over HTTPS so secure-context-only APIs (AudioWorklet,
Service Worker, IndexedDB persistence) work the same way they will in
production. Plain HTTP only gets the secure-context exemption on
`localhost`, so anything off-box needs real TLS.

There are two ways to get a trusted HTTPS URL on a phone. The first
(tailscale) is the default and what `start-dev.bat` sets up. The second
(mkcert) is the fallback for when tailscale isn't available — e.g. you
need to demo on a coffee-shop WiFi the phone isn't tailnet-signed-into.

## Default: tailscale serve (recommended)

Why this is the default: the cert chain is publicly-trusted Let's Encrypt,
so the phone needs **zero setup** — install the Tailscale app, sign in
once, done. Works on any network the phone is on, not just home WiFi.

### One-time setup (per machine and per phone)

1. **Dev machine.** Install Tailscale (https://tailscale.com/download),
   sign in. Confirm `tailscale status` lists this machine.
2. **Phone.** Install the Tailscale app from the Play Store / App Store,
   sign in with the same account. Confirm the phone shows up in
   `tailscale status` on the dev machine.

### Per-session

Run `start-dev.bat` from `C:\GDrive\SleepApp\`. It does two things:

```bat
"C:\Program Files\Tailscale\tailscale.exe" serve --bg --https=443 http://localhost:5175
npm run dev
```

`tailscale serve` is **persistent** (the `--bg` flag stores the config in
the tailscaled daemon, surviving reboots), so you only really need to run
it once. `start-dev.bat` re-runs it idempotently for safety.

Open `https://<host>.<tailnet-id>.ts.net/` on the phone (your machine's
tailnet hostname — run `tailscale status --self` to get it; the launcher
also echoes it on startup). Green lock, no warnings.

### Gotchas

- **Phone must be on the tailnet.** If `tailscale status` shows the phone
  as `offline`, open the Tailscale app on the phone and toggle it on.
  Cellular and any WiFi both work — the tailnet routes over the internet,
  not the LAN.
- **`502 Bad Gateway` from the tailnet URL** means tailscaled can reach
  this machine but vite isn't up on port 5175. Check `dev-server.log` and
  confirm `curl http://localhost:5175/` returns HTML locally.
- **Tailnet hostname is per-device.** Each machine on the tailnet has
  its own `<host>.<tailnet-id>.ts.net` name. `start-dev.bat` looks it up
  via `tailscale status --self` at launch — if it can't find a value
  you'll see the placeholder in the echoed URL.
- **One serve config at a time** for a given port. Running
  `tailscale serve --bg --https=443 http://localhost:4173` later
  (preview) replaces the dev mapping. Use `tailscale serve status` to
  see what's currently mapped, `tailscale serve reset` to clear.

## Fallback: mkcert + LAN IP

Use this when you can't get on the tailnet — e.g. demoing to someone on
a network the phone hasn't been signed into Tailscale on, or testing
without an internet connection.

### One-time setup (per machine)

1. Install mkcert (`winget install FiloSottile.mkcert`).
2. `mkcert -install` — installs the mkcert root CA into the local trust
   store.
3. Generate a dev cert covering localhost + the LAN IP:

   ```pwsh
   mkdir certs
   mkcert -key-file certs/dev-key.pem -cert-file certs/dev-cert.pem `
       localhost 127.0.0.1 <lan-ip>
   ```

   (`<lan-ip>` is this machine's LAN IP. If it changes you have to
   re-issue.) `certs/` is gitignored.

### One-time setup (per phone)

The phone has to trust the mkcert root CA, or Chrome rejects the
self-signed chain with `ERR_EMPTY_RESPONSE` (no bypass page).

1. On the dev machine, run `mkcert -CAROOT` to get the path — typically
   `C:\Users\<user>\AppData\Local\mkcert\`. The relevant file is
   `rootCA.pem`.
2. Get `rootCA.pem` onto the phone (email it to yourself, Drive, USB).
3. On Android: **Settings → Security → Encryption & credentials →
   Install a certificate → CA certificate** → accept the
   "your data won't be private" warning → select `rootCA.pem`.
   On iOS: AirDrop / mail the file, open it, install the profile under
   **Settings → General → Profile**, then trust it under
   **Settings → General → About → Certificate Trust Settings**.
4. Reboot the phone (Android sometimes needs this to honor a new user CA
   for Chrome).

### Per-session

```pwsh
$env:VITE_USE_HTTPS = "1"
npm run dev
```

Open `https://<lan-ip>:5175/` on the phone. Green lock if the CA is
installed correctly; `NET::ERR_CERT_AUTHORITY_INVALID` if not.

### Gotchas

- **Phone has to be on the same WiFi.** mkcert IP-SAN certs only cover
  the IP the dev machine had at issue time. LAN-only by definition.
- **Cert SAN must include the LAN IP.** `basicSsl()`'s default cert
  covers `localhost` and `127.0.0.1` but not the LAN IP — Android Chrome
  drops with `ERR_EMPTY_RESPONSE` (not a bypass page, just a closed
  connection) when the SAN doesn't match the host. That's why
  `vite.config.ts` prefers `certs/dev-cert.pem` when present.
- **Android 7+ trust scope.** User-installed CAs aren't trusted by every
  app (only ones that opt in via Network Security Config). Chrome
  honors them for normal browsing, which covers this workflow. If you
  embed the app in a WebView later, you may need extra config.
- **Firewall.** Windows needs an inbound rule for the dev port:

  ```pwsh
  New-NetFirewallRule -DisplayName "Vite Dev 5175" -Direction Inbound `
      -Protocol TCP -LocalPort 5175 -Action Allow -Profile Any
  ```

  Profile `Any` matters because the home Ethernet may be categorised as
  Public.

## Which one am I on right now?

- `tailscale serve status` shows a mapping → tailscale path is live.
- Vite log says `Local: https://...` → `VITE_USE_HTTPS=1` is set.
- Vite log says `Local: http://...` → tailscale path (vite is plain HTTP,
  tailscaled fronts it).
