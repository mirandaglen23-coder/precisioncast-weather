@echo off
title PrecisionCast - Hyper-Local ML Weather Predictor
cd /d "%~dp0"

echo ===================================================
echo   PrecisionCast: Hyper-Local ML Weather Predictor
echo ===================================================
echo.
echo [1/2] Launching web browser to http://localhost:3000 ...
start http://localhost:3000

echo [2/2] Starting server and machine learning engine...
echo.
npm run dev

pause
