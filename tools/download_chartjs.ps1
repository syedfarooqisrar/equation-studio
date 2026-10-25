# 📁 FILE: D:\EquationTool\tools\download_chartjs.ps1
# 📌 WHAT: Downloads Chart.js 4.4.1 (MIT) into assets\chart.umd.min.js, trying several mirrors
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$dest = Join-Path (Split-Path $PSScriptRoot -Parent) "assets\chart.umd.min.js"
$sources = @(
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://unpkg.com/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
)
foreach ($u in $sources) {
  try {
    Invoke-WebRequest -Uri $u -OutFile $dest -UseBasicParsing -TimeoutSec 30
    if ((Get-Item $dest).Length -gt 100000) { Write-Host "OK  $u" -ForegroundColor Green; exit 0 }
    Remove-Item $dest -Force -ErrorAction SilentlyContinue
  } catch {
    Write-Host "failed: $u : $($_.Exception.Message)" -ForegroundColor DarkYellow
  }
}
Write-Host "Could not download Chart.js. Send me the messages above." -ForegroundColor Red
exit 1