@echo off
REM Unregister .mentor file association (HKCU only)
setlocal
echo Removing Mentor .mentor association...
reg delete "HKCU\Software\Classes\.mentor" /f >nul 2>&1
reg delete "HKCU\Software\Classes\Mentor.File" /f >nul 2>&1
reg delete "HKCU\Software\Classes\Applications\mentor.cmd" /f >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$sig='[DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int e,uint f,IntPtr d,IntPtr i);'; ^
   $t=Add-Type -MemberDefinition $sig -Name SN -Namespace N2 -PassThru; ^
   $t::SHChangeNotify(0x8000000,0x1000,[IntPtr]::Zero,[IntPtr]::Zero)"
echo Done.
endlocal
