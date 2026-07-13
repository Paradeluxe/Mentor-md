@echo off
REM Mentor - double-click launcher (Windows)
REM v1.43.19: URL-encode ?open= path (spaces / CJK / special chars)

setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "OPEN_FILE=%~1"
set "OPEN_URL=http://127.0.0.1:8765/index.html"

if not "%OPEN_FILE%"=="" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[uri]::EscapeDataString([string]'%OPEN_FILE%')"`) do (
    set "OPEN_URL=http://127.0.0.1:8765/index.html?open=%%A"
  )
)

netstat -an | findstr ":8765.*LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
  start "" "!OPEN_URL!"
  goto :end
)

if "%OPEN_FILE%"=="" (
  start "Mentor Server" /MIN python mentor-server.py
) else (
  start "Mentor Server" /MIN python mentor-server.py --open "%OPEN_FILE%"
)

:end
endlocal
