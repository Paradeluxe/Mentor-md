# Register .mentor → Mentor (HKCU, no admin)
$ErrorActionPreference = 'Stop'
$cmd = 'E:\hermes_playground\Mentor\mentor.cmd'
$ico = 'E:\hermes_playground\Mentor\assets\mentor.ico'

# ProgID
New-Item -Path 'HKCU:\Software\Classes\Mentor.File' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Mentor.File' -Name '(default)' -Value 'Mentor Document'

New-Item -Path 'HKCU:\Software\Classes\Mentor.File\DefaultIcon' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Mentor.File\DefaultIcon' -Name '(default)' -Value $ico

New-Item -Path 'HKCU:\Software\Classes\Mentor.File\shell\open' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Mentor.File\shell\open' -Name '(default)' -Value '用 Mentor 打开'

New-Item -Path 'HKCU:\Software\Classes\Mentor.File\shell\open\command' -Force | Out-Null
$cmdLine = '"{0}" "%1"' -f $cmd
Set-ItemProperty -Path 'HKCU:\Software\Classes\Mentor.File\shell\open\command' -Name '(default)' -Value $cmdLine

# Extension
New-Item -Path 'HKCU:\Software\Classes\.mentor' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\.mentor' -Name '(default)' -Value 'Mentor.File'
New-Item -Path 'HKCU:\Software\Classes\.mentor\OpenWithProgids' -Force | Out-Null
New-ItemProperty -Path 'HKCU:\Software\Classes\.mentor\OpenWithProgids' -Name 'Mentor.File' -PropertyType None -Force -ErrorAction SilentlyContinue | Out-Null

# Notify shell
$sig = '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, uint flags, IntPtr item1, IntPtr item2);'
$type = Add-Type -MemberDefinition $sig -Name ShellNotify -Namespace Win32 -PassThru
$type::SHChangeNotify(0x8000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host 'OK: .mentor registered'
Write-Host ('command = ' + (Get-ItemProperty 'HKCU:\Software\Classes\Mentor.File\shell\open\command').'(default)')
Write-Host ('.mentor  = ' + (Get-ItemProperty 'HKCU:\Software\Classes\.mentor').'(default)')
