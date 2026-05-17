@echo off
REM Dev launcher: Vite on http://localhost:5175 + tailscale serve fronting
REM it with https://crane-desk.saiga-wage.ts.net (publicly-trusted TLS via
REM Let's Encrypt, no per-device CA install needed). Any device signed
REM into the tailnet — phone included — can hit the tailnet URL directly.
REM
REM If your tailnet hostname differs from "crane-desk.saiga-wage.ts.net",
REM edit the echo line below. The serve config is idempotent: re-running
REM with the same target overwrites cleanly.
REM
REM To revert to direct HTTPS via mkcert (e.g. tailscale unavailable),
REM set VITE_USE_HTTPS=1 before npm run dev and open https://<lan-ip>:5175
REM from a device that trusts the mkcert root CA — see
REM notes/dev-cert-android.md.

cd /d C:\GDrive\SleepApp

REM Ensure tailscale serve is proxying to the dev port. Idempotent — if
REM the mapping is already set this just rewrites it.
"C:\Program Files\Tailscale\tailscale.exe" serve --bg --https=443 http://localhost:5175 >nul 2>&1

echo.
echo   Tailnet:  https://crane-desk.saiga-wage.ts.net/
echo   Local:    http://localhost:5175/
echo   Logs:     C:\GDrive\SleepApp\dev-server.log
echo.
echo   Open the tailnet URL on any tailnet-signed-in device (phone included).
echo.

npm run dev > C:\GDrive\SleepApp\dev-server.log 2>&1
