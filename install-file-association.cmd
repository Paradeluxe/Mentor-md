@echo off
REM Mentor - register .mentor association (calls PowerShell, HKCU, no admin)
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\register-mentor-assoc.ps1"
if errorlevel 1 (
  echo FAILED
  exit /b 1
)
echo.
echo Also updating Desktop shortcut icon...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=New-Object -ComObject WScript.Shell; $l=$s.CreateShortcut($env:USERPROFILE+'\Desktop\Mentor.lnk'); $l.TargetPath='%~dp0mentor.cmd'; $l.WorkingDirectory='%~dp0'; $l.IconLocation='%~dp0assets\mentor.ico,0'; $l.Description='Mentor - Markdown 批注工具'; $l.Save(); Write-Host 'Desktop shortcut OK'"
echo Done.
endlocal
