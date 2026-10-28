# 📁 FILE: D:\EquationTool\tools\download_tectonic.ps1
# 📌 WHAT: Downloads the Tectonic LaTeX engine (Windows) into tools\tectonic\tectonic.exe
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"
$dest = Join-Path $PSScriptRoot "tectonic"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$zip = Join-Path $env:TEMP "tectonic-win.zip"

$url = $null
try {
  $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/tectonic-typesetting/tectonic/releases/latest" -Headers @{ "User-Agent" = "EquationStudio" }
  $asset = $rel.assets | Where-Object { $_.name -match "x86_64-pc-windows-msvc.*\.zip$" } | Select-Object -First 1
  if ($asset) { $url = $asset.browser_download_url; Write-Host "Found: $($asset.name)" -ForegroundColor Cyan }
} catch { Write-Host "GitHub API failed: $($_.Exception.Message)" -ForegroundColor DarkYellow }
if (-not $url) { $url = "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-x86_64-pc-windows-msvc.zip" }

try {
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 300
  Expand-Archive -Path $zip -DestinationPath $dest -Force
  $exe = Get-ChildItem -Path $dest -Recurse -Filter "tectonic.exe" | Select-Object -First 1
  if (-not $exe) { throw "tectonic.exe was not in the zip" }
  if ($exe.FullName -ne (Join-Path $dest "tectonic.exe")) { Copy-Item $exe.FullName (Join-Path $dest "tectonic.exe") -Force }
  Write-Host "`nInstalled: $(Join-Path $dest 'tectonic.exe')" -ForegroundColor Green
  & (Join-Path $dest "tectonic.exe") --version
} catch {
  Write-Host "`nDownload failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Manual way: open https://github.com/tectonic-typesetting/tectonic/releases , download the Windows (x86_64-pc-windows-msvc) .zip, and put tectonic.exe in tools\tectonic\" -ForegroundColor Yellow
  exit 1
}
