@echo off
REM Dev launcher: Vite on http://localhost:5175 + tailscale serve fronting
REM it over HTTPS via a Let's Encrypt cert on your tailnet hostname (form
REM <host>.<tailnet-id>.ts.net). Any device signed into the same tailnet —
REM phone included — can hit the tailnet URL directly with no per-device
REM CA install.
REM
REM To revert to direct HTTPS via mkcert (e.g. tailscale unavailable),
REM set VITE_USE_HTTPS=1 before npm run dev and open https://<lan-ip>:5175
REM from a device that trusts the mkcert root CA — see
REM notes/dev-cert-android.md.

cd /d C:\GDrive\SleepApp

REM Ensure tailscale serve is proxying to the dev port. Idempotent — if
REM the mapping is already set this just rewrites it.
"C:\Program Files\Tailscale\tailscale.exe" serve --bg --https=443 http://localhost:5175 >nul 2>&1

REM Look up this machine's tailnet hostname so we can echo it without
REM hardcoding it in the file. Falls back to a placeholder if tailscale
REM isn't installed or hasn't joined a tailnet.
set TAILNET_HOST=<host>.<tailnet-id>.ts.net
for /f "tokens=2" %%a in ('"C:\Program Files\Tailscale\tailscale.exe" status --self 2^>nul ^| findstr /R "^[0-9]"') do set TAILNET_HOST=%%a

echo.
echo   Tailnet:  https://%TAILNET_HOST%/
echo   Local:    http://localhost:5175/
echo   Logs:     C:\GDrive\SleepApp\dev-server.log
echo.
echo   Open the tailnet URL on any tailnet-signed-in device (phone included).
echo.

npm run dev > C:\GDrive\SleepApp\dev-server.log 2>&1
