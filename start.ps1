# PrecisionCast Auto-Launcher
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  PrecisionCast: Hyper-Local ML Weather Predictor  " -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[1/2] Launching browser to http://localhost:3000 ..." -ForegroundColor Green
Start-Process "http://localhost:3000"

Write-Host "[2/2] Starting server and machine learning engine..." -ForegroundColor Green
Write-Host ""
npm run dev
