@echo off
REM Mentor launcher (Windows) — Word-style shell first
REM v1.49: Word-style only — pending-open queue; deep-link REMOVED (fail loud)

setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

REM --- port ---
set "MENTOR_PORT=8787"
if exist "%~dp0PORT" (
  set /p MENTOR_PORT=<"%~dp0PORT"
)
set "MENTOR_PORT=%MENTOR_PORT: =%"

REM --- find python ---
set "PYEXE="
where python >nul 2>&1 && set "PYEXE=python"
if not defined PYEXE (
  where py >nul 2>&1 && set "PYEXE=py -3"
)
if not defined PYEXE if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PYEXE=%LocalAppData%\Programs\Python\Python312\python.exe"
if not defined PYEXE if exist "%LocalAppData%\Programs\Python\Python311\python.exe" set "PYEXE=%LocalAppData%\Programs\Python\Python311\python.exe"
if not defined PYEXE if exist "%LocalAppData%\Programs\Python\Python310\python.exe" set "PYEXE=%LocalAppData%\Programs\Python\Python310\python.exe"
if not defined PYEXE if exist "C:\Python311\python.exe" set "PYEXE=C:\Python311\python.exe"
if not defined PYEXE if exist "C:\Python312\python.exe" set "PYEXE=C:\Python312\python.exe"
if not defined PYEXE (
  echo.
  echo [Mentor] Python not found on PATH.
  echo Install Python 3 from https://www.python.org/downloads/
  echo and check "Add python.exe to PATH", then retry.
  echo.
  pause
  exit /b 1
)

set "OPEN_FILE=%~f1"
REM Word-style only: clean shell URL; no deep-link, no allow-open mask
set "OPEN_URL=http://127.0.0.1:%MENTOR_PORT%/index.html"

REM --- is port listening? ---
netstat -an | findstr ":%MENTOR_PORT%.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
  REM Must be real mentor-server (/session JSON), NOT plain http.server serving index.html
  for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "try { $s=Invoke-RestMethod -Uri 'http://127.0.0.1:%MENTOR_PORT%/session' -TimeoutSec 2; if ($s.token) { 'yes' } else { 'no' } } catch { 'no' }"`) do set "SESSION_CHK=%%T"
  setlocal EnableDelayedExpansion
  if /i "!SESSION_CHK!"=="yes" (
    REM If a file was passed, queue Word-style pending-open then open shell
    if not "%OPEN_FILE%"=="" (
      powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$port='%MENTOR_PORT%'; $path='%OPEN_FILE%'; $tok=''; if (Test-Path '.mentor-session') { $tok = (Get-Content -Raw '.mentor-session').Trim() }; if (-not $tok) { $s=Invoke-RestMethod -Uri (\"http://127.0.0.1:$port/session\") -TimeoutSec 2; $tok=$s.token }; if (-not $tok) { throw 'no session token' }; $r=Invoke-RestMethod -Method Post -Uri (\"http://127.0.0.1:$port/pending-open\") -ContentType 'application/json' -Body (@{token=$tok; path=$path} | ConvertTo-Json) -TimeoutSec 3; if (-not $r.ok) { throw 'pending-open failed' }"
    )
    start "" "!OPEN_URL!"
    endlocal
    goto :end
  )
  endlocal
  echo [Mentor] Port %MENTOR_PORT% is listening but is NOT mentor-server.py
  echo ^(e.g. python -m http.server has no /session — AI/Hermes will fail^).
  echo Kill that process, then re-run mentor.cmd.
  pause
  exit /b 2
)

REM start server (server queues pending-open when --open is set; browser gets clean URL)
if "%OPEN_FILE%"=="" (
  start "Mentor Server :%MENTOR_PORT%" /MIN %PYEXE% mentor-server.py --port %MENTOR_PORT%
) else (
  start "Mentor Server :%MENTOR_PORT%" /MIN %PYEXE% mentor-server.py --port %MENTOR_PORT% --open "%OPEN_FILE%"
)

:end
endlocal
