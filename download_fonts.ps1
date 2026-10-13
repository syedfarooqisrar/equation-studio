# 📁 FILE: D:\EquationTool\download_fonts.ps1
# 📌 WHAT: Downloads the KaTeX/MathLive math fonts into .\fonts, trying several mirrors

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dest = Join-Path $PSScriptRoot "fonts"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$sources = @(
  "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/fonts",
  "https://unpkg.com/katex@0.16.9/dist/fonts",
  "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/fonts",
  "https://fastly.jsdelivr.net/npm/katex@0.16.9/dist/fonts",
  "https://gcore.jsdelivr.net/npm/katex@0.16.9/dist/fonts"
)

$files = @(
  "KaTeX_AMS-Regular.woff2", "KaTeX_Caligraphic-Bold.woff2", "KaTeX_Caligraphic-Regular.woff2",
  "KaTeX_Fraktur-Bold.woff2", "KaTeX_Fraktur-Regular.woff2", "KaTeX_Main-Bold.woff2",
  "KaTeX_Main-BoldItalic.woff2", "KaTeX_Main-Italic.woff2", "KaTeX_Main-Regular.woff2",
  "KaTeX_Math-BoldItalic.woff2", "KaTeX_Math-Italic.woff2", "KaTeX_SansSerif-Bold.woff2",
  "KaTeX_SansSerif-Italic.woff2", "KaTeX_SansSerif-Regular.woff2", "KaTeX_Script-Regular.woff2",
  "KaTeX_Size1-Regular.woff2", "KaTeX_Size2-Regular.woff2", "KaTeX_Size3-Regular.woff2",
  "KaTeX_Size4-Regular.woff2", "KaTeX_Typewriter-Regular.woff2"
)

$dead = @{}
$failed = @()

foreach ($f in $files) {
  $out = Join-Path $dest $f
  $ok = $false
  foreach ($src in $sources) {
    if ($dead.ContainsKey($src)) { continue }
    try {
      Invoke-WebRequest -Uri "$src/$f" -OutFile $out -UseBasicParsing -TimeoutSec 20
      if ((Get-Item $out).Length -gt 1000) {
        Write-Host "OK     $f  <-  $($src.Split('/')[2])" -ForegroundColor Green
        $ok = $true
        break
      }
      Remove-Item $out -Force -ErrorAction SilentlyContinue
    } catch {
      $msg = $_.Exception.Message
      Write-Host "  host failed: $($src.Split('/')[2]) : $msg" -ForegroundColor DarkYellow
      if ($msg -match "could not be resolved|timed out|unable to connect") { $dead[$src] = $true }
    }
  }
  if (-not $ok) { $failed += $f; Write-Host "FAILED $f (all mirrors)" -ForegroundColor Red }
}

if ($failed.Count -eq 0) { Write-Host "`nAll 20 fonts downloaded to $dest" -ForegroundColor Green }
else { Write-Host "`nFailed: $($failed -join ', ')" -ForegroundColor Yellow }