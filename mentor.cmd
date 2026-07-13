@echo off
REM Mentor launcher (Windows)
REM v1.43.20: port 8787 (avoid 8765 clashes) + robust Python discovery + Mentor title check

setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

REM --- port ---
set "MENTOR_PORT=8787"
if exist "%~dp0PORT" (
  set /p MENTOR_PORT=<"%~dp0PORT"
)
set "MENTOR_PORT=!MENTOR_PORT: =!"

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

set "OPEN_FILE=%~1"
set "OPEN_URL=http://127.0.0.1:!MENTOR_PORT!/index.html"

if not "%OPEN_FILE%"=="" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[uri]::EscapeDataString([string]'%OPEN_FILE%')"`) do (
    set "OPEN_URL=http://127.0.0.1:!MENTOR_PORT!/index.html?open=%%A"
  )
)

REM --- is port listening? ---
netstat -an | findstr ":!MENTOR_PORT!.*LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
  REM verify it is Mentor (not psyclaw / other)
  set "IS_MENTOR=0"
  for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri 'http://127.0.0.1:!MENTOR_PORT!/index.html'; if ($r.Content -match 'Mentor') { 'yes' } else { 'no' } } catch { 'no' }"`) do set "TITLE_CHK=%%T"
  if /i "!TITLE_CHK!"=="yes" (
    start "" "!OPEN_URL!"
    goto :end
  )
  echo [Mentor] Port !MENTOR_PORT! is in use by another app.
  echo Close that process or change PORT file, then retry.
  pause
  exit /b 2
)

REM start server
if "%OPEN_FILE%"=="" (
  start "Mentor Server :!MENTOR_PORT!" /MIN !PYEXE! mentor-server.py --port !MENTOR_PORT!
) else (
  start "Mentor Server :!MENTOR_PORT!" /MIN !PYEXE! mentor-server.py --port !MENTOR_PORT! --open "%OPEN_FILE%"
)

:end
endlocal
