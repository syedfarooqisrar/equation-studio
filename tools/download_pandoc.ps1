# 📁 FILE: D:\EquationTool\tools\download_pandoc.ps1
# 📌 WHAT: Downloads the newest Pandoc for Windows (free) into tools\pandoc\pandoc.exe
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'tools\pandoc'
$exe  = Join-Path $dest 'pandoc.exe'
$tmp  = $null

if (Test-Path $exe) {
    Write-Host "Pandoc is already here: $exe"
    & $exe --version | Select-Object -First 1
    exit 0
}

try {
    Write-Host 'Looking for the latest Pandoc release...'
    $hdr = @{ 'User-Agent' = 'EquationStudio' }
    $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/jgm/pandoc/releases/latest' -Headers $hdr
    $asset = $rel.assets | Where-Object { $_.name -match 'windows-x86_64\.zip$' } | Select-Object -First 1
    if (-not $asset) { throw 'No Windows zip was found in the latest release.' }

    $tmp = Join-Path $env:TEMP ('pandoc_' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $zip = Join-Path $tmp $asset.name

    Write-Host "Downloading $($asset.name) ..."
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -Headers $hdr
    Expand-Archive -Path $zip -DestinationPath $tmp -Force

    $found = Get-ChildItem -Path $tmp -Recurse -Filter pandoc.exe | Select-Object -First 1
    if (-not $found) { throw 'pandoc.exe was not inside the zip.' }

    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Copy-Item $found.FullName $exe -Force
    Write-Host "Done: $exe"
    & $exe --version | Select-Object -First 1
}
catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Manual way: download the Windows zip from https://github.com/jgm/pandoc/releases/latest and copy pandoc.exe into tools\pandoc\'
    exit 1
}
finally {
    if ($tmp -and (Test-Path $tmp)) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}