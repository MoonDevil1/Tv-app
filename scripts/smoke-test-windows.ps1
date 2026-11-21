$ErrorActionPreference = "Stop"
$exe = Join-Path $PWD "release\win-unpacked\TG IPTV.exe"
if (-not (Test-Path $exe)) { throw "Packaged executable not found: $exe" }

$marker = $null
$process = $null
try {
  $process = Start-Process -FilePath $exe -ArgumentList @("--smoke-test", "--disable-gpu") -PassThru
  $marker = Join-Path $env:TEMP "tg-iptv-smoke-$($process.Id).txt"
  $deadline = (Get-Date).AddSeconds(35)
  while ((Get-Date) -lt $deadline) {
    $process.Refresh()
    if ($process.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }

  $process.Refresh()
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "Packaged app did not finish its startup smoke test within 35 seconds."
  }

  if ($process.ExitCode -ne 0) {
    $detail = if (Test-Path $marker) { Get-Content $marker -Raw } else { "No diagnostic marker was written." }
    throw "Packaged app startup failed (exit $($process.ExitCode)): $detail"
  }
  if (-not (Test-Path $marker) -or (Get-Content $marker -Raw).Trim() -ne "ok") {
    $detail = if (Test-Path $marker) { Get-Content $marker -Raw } else { "No diagnostic marker was written." }
    throw "Packaged app did not confirm renderer/preload readiness: $detail"
  }

  Write-Host "Packaged Windows app started; renderer root and preload bridge are ready."
}
finally {
  if ($marker -and (Test-Path $marker)) { Remove-Item $marker -Force }
}
