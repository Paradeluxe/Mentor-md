@echo off
REM 兼容旧入口 → 转调 安装.cmd
cd /d "%~dp0"
if exist "%~dp0安装.cmd" (
  call "%~dp0安装.cmd"
  exit /b %ERRORLEVEL%
)
REM fallback（无中文文件名环境）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\register-mentor-assoc.ps1"
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=New-Object -ComObject WScript.Shell; $desk=[Environment]::GetFolderPath('Desktop'); $l=$s.CreateShortcut((Join-Path $desk 'Mentor.lnk')); $l.TargetPath='%~dp0mentor.cmd'; $l.WorkingDirectory='%~dp0'; $ico='%~dp0assets\mentor.ico'; if (-not (Test-Path $ico)) { $ico='%~dp0mentor.ico' }; $l.IconLocation=$ico+',0'; $l.Description='Mentor'; $l.Save(); Write-Host 'Desktop OK'"
echo Done.
