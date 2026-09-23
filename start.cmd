@echo off
REM ---------------------------------------------------------------------------
REM  Start the AI Travel Agent locally (Windows).
REM
REM  Runs the embedded PostgreSQL and the Next.js dev server. Double-click this
REM  file, or run it from a terminal.
REM
REM  The database is started with pg_ctl, which detaches the postmaster, so it
REM  keeps running after this script exits. The web server runs in the
REM  foreground: press Ctrl+C here to stop it.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

echo.
echo === AI Travel Agent ===
echo.

if not exist "node_modules" (
  echo [!] Dependencies are missing. Run this first:
  echo.
  echo     npm install
  echo.
  pause
  exit /b 1
)

REM The dev port is pinned in package.json, so a second instance cannot just pick
REM another port - it would fail with EADDRINUSE. Say so clearly instead.
netstat -ano | findstr /r /c:":3001 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [i] Port 3001 is already in use - the app looks like it is already running.
  echo.
  echo     Open: http://localhost:3001
  echo.
  echo     To restart it, stop the process holding port 3001 first:
  echo         netstat -ano ^| findstr :3001
  echo         taskkill /PID ^<pid^> /F
  echo.
  pause
  exit /b 0
)

echo [1/2] Starting PostgreSQL ^(embedded, port 55432^) ...
call npm run db:start
if errorlevel 1 (
  echo.
  echo [!] The database failed to start. See the messages above.
  pause
  exit /b 1
)

echo.
echo [2/2] Starting the web server ...
echo.
echo     Open:  http://localhost:3001
echo     Login: demo@travel-agent.dev / Demo1234
echo.
echo     Press Ctrl+C to stop the web server.
echo     ^(The database keeps running; stop it with: npm run db:stop^)
echo.

call npm run dev

endlocal
