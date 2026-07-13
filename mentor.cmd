@echo off
REM Mentor - 双击启动 (Windows)
REM 启动 HTTP server 在 :8765, 打开浏览器

setlocal
cd /d "%~dp0"

REM 检查 server 是否已在跑
netstat -an | findstr ":8765.*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  if not "%~1"=="" (
    REM Server 已跑, 直接打开 .mentor URL
    start "" "http://127.0.0.1:8765/index.html?open=%~1"
  ) else (
    start "" "http://127.0.0.1:8765/index.html"
  )
  goto :end
)

REM 启动 Python server 后台 (含自动 browser 打开)
if "%~1"=="" (
  start "Mentor Server" /MIN python mentor-server.py
) else (
  start "Mentor Server" /MIN python mentor-server.py --open "%~1"
)

:end
endlocal
