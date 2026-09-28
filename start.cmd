@echo off
REM ---------------------------------------------------------------------------
REM  Start the AI Travel Agent locally (Windows).
REM
REM  Double-click this file, or run it from a terminal.
REM
REM  Every step is verified before the next one runs, and any failure is
REM  reported together with the command that fixes it. The previous version
REM  could sit silently on "starting PostgreSQL ..." while the browser showed
REM  ERR_CONNECTION_REFUSED, which told the user nothing about what broke.
REM
REM  What you end up with:
REM    * a window titled "AI Travel Agent (web)"  -> the Next.js dev server
REM    * this window                              -> the result and any errors
REM    * PostgreSQL                               -> started detached on 55432
REM
REM  Close the "(web)" window to stop the site. Stop the database with
REM  `npm run db:stop`.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"
title AI Travel Agent

set "WEB_URL=http://localhost:3001"
set "WEB_PORT=3001"

echo.
echo  === AI Travel Agent ===
echo.

REM --------------------------------------------------------------- 1. deps
if not exist "node_modules" (
  echo  [!] Dependencies are missing. Run this first:
  echo.
  echo        npm install
  echo.
  pause
  exit /b 1
)

REM ------------------------------------------- 2. already running somewhere?
netstat -ano | findstr /r /c:":%WEB_PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo  [i] Port %WEB_PORT% is already in use - the app looks like it is already running.
  echo.
  echo      Open: %WEB_URL%
  echo.
  echo      To restart it, stop the process holding port %WEB_PORT% first:
  echo          netstat -ano ^| findstr :%WEB_PORT%
  echo          taskkill /PID ^<pid^> /F
  echo.
  start "" "%WEB_URL%"
  pause
  exit /b 0
)

REM ---------------------------------------------------------------- 3. database
echo  [1/3] Database ^(embedded PostgreSQL, port 55432^) ...
echo.
call npm run db:start
if errorlevel 1 goto :db_failed

REM pg_ctl reporting "running" is not proof the cluster can serve queries, so
REM ask for a real round-trip before starting the app on top of it.
call npm run db:ping >nul 2>&1
if errorlevel 1 goto :db_failed
echo.
echo        database is accepting connections.

REM ------------------------------------------------------------- 4. web server
echo.
echo  [2/3] Web server ...
echo.

REM The dev server goes in its own window so this one stays free to report the
REM outcome, and so closing this launcher cannot take the server down with it.
start "AI Travel Agent (web)" cmd /k "npm run dev"

REM ------------------------------------------------------------ 5. verify ready
echo  [3/3] Waiting for the app to answer on %WEB_URL% ...
echo.
node scripts\wait-for-server.mjs "%WEB_URL%/api/meta" 90
if errorlevel 1 goto :web_failed

echo.
echo  ============================================================
echo    Ready:  %WEB_URL%
echo    Login:  demo@travel-agent.dev / Demo1234
echo  ============================================================
echo.
echo    The site runs in the "AI Travel Agent (web)" window.
echo    Close that window to stop it; this one can be closed safely.
echo.

start "" "%WEB_URL%"
pause
exit /b 0

REM ----------------------------------------------------------------- failures
:db_failed
echo.
echo  [!] The database did not come up, so the web server was NOT started.
echo      That is why the browser would show "localhost refused to connect".
echo.
echo      Diagnosis:
echo.
call npm run db:doctor
echo.
echo      Most common fix (a postmaster that is alive but can no longer serve):
echo          npm run db:stop
echo          npm run db:serve       ^(leave that window running^)
echo.
pause
exit /b 1

:web_failed
echo.
echo  [!] The database is fine, but the web server never answered on %WEB_URL%.
echo.
echo      Check the "AI Travel Agent (web)" window for the Next.js error,
echo      then re-run this script. Full diagnosis:
echo.
call npm run db:doctor
echo.
pause
exit /b 1

endlocal
