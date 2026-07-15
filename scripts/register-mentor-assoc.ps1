# Register .mentor → Mentor (HKCU, no admin). Portable: paths relative to this script.
# Layout: <root>/scripts/register-mentor-assoc.ps1 → root = parent
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'mentor.cmd'))) {
  # fallback: script next to mentor.cmd
  $root = $PSScriptRoot
}
$cmd = Join-Path $root 'mentor.cmd'
$ico = Join-Path $root 'assets\mentor.ico'
if (-not (Test-Path $ico)) { $ico = Join-Path $root 'mentor.ico' }

if (-not (Test-Path $cmd)) {
  Write-Error "mentor.cmd not found under $root"
  exit 1
}

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
Write-Host ('root    = ' + $root)
Write-Host ('command = ' + (Get-ItemProperty 'HKCU:\Software\Classes\Mentor.File\shell\open\command').'(default)')
Write-Host ('.mentor  = ' + (Get-ItemProperty 'HKCU:\Software\Classes\.mentor').'(default)')
