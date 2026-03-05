param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

function Stop-PortListener {
  param([int]$Port)

  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    Write-Host "No listener on port $Port"
    return
  }

  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    if ($processId -and $processId -ne 0) {
      try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        Write-Host "Killed PID $processId on port $Port"
      } catch {
        Write-Host "Failed to kill PID $processId on port ${Port}: $($_.Exception.Message)"
      }
    }
  }
}

Write-Host "Resetting prod on port $Port..."
Stop-PortListener -Port $Port

Start-Sleep -Milliseconds 400

if (Test-Path .next) {
  Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Removed .next"
}

Write-Host "Building..."
npm -s run build

Write-Host "Starting..."
$env:PORT = "$Port"
npm -s run start
