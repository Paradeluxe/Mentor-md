@echo off
REM Mentor 一次安装：桌面快捷方式 + .mentor 文件关联（HKCU，无需管理员）
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  === Mentor 安装 ===
echo  目录: %CD%
echo.

REM --- Python check ---
set "PYEXE="
where python >nul 2>&1 && set "PYEXE=python"
if not defined PYEXE where py >nul 2>&1 && set "PYEXE=py -3"
if not defined PYEXE (
  echo [!] 未找到 Python 3。
  echo     请安装: https://www.python.org/downloads/
  echo     安装时勾选 "Add python.exe to PATH"，然后重新运行本脚本。
  echo.
  start "" "https://www.python.org/downloads/"
  pause
  exit /b 1
)
echo [ok] Python: %PYEXE%

if not exist "%~dp0mentor.cmd" (
  echo [!] 缺少 mentor.cmd，请确认解压完整。
  pause
  exit /b 1
)
if not exist "%~dp0mentor-server.py" (
  echo [!] 缺少 mentor-server.py
  pause
  exit /b 1
)
if not exist "%~dp0index.html" (
  echo [!] 缺少 index.html
  pause
  exit /b 1
)

echo [..] 注册 .mentor 文件关联...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\register-mentor-assoc.ps1"
if errorlevel 1 (
  echo [!] 文件关联失败
  pause
  exit /b 1
)

echo [..] 创建桌面快捷方式...
set "ICO=%~dp0assets\mentor.ico"
if not exist "%ICO%" set "ICO=%~dp0mentor.ico"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=New-Object -ComObject WScript.Shell; $desk=[Environment]::GetFolderPath('Desktop'); $l=$s.CreateShortcut((Join-Path $desk 'Mentor.lnk')); $l.TargetPath='%~dp0mentor.cmd'; $l.WorkingDirectory='%~dp0'; $l.IconLocation='%~dp0assets\mentor.ico,0'; if (-not (Test-Path '%~dp0assets\mentor.ico')) { $l.IconLocation='%~dp0mentor.ico,0' }; $l.Description='Mentor — 像 docx 一样批注 Markdown'; $l.Save(); Write-Host 'Desktop: Mentor.lnk'"

echo.
echo  === 完成 ===
echo  1. 桌面双击 "Mentor" 启动
echo  2. 或双击任意 .mentor 文件打开
echo  3. 需要浏览器 Chrome / Edge（推荐）
echo.
echo  现在启动一次? (Y/N)
choice /C YN /N /M ">"
if errorlevel 2 goto :done
start "" "%~dp0mentor.cmd"

:done
echo.
pause
endlocal
