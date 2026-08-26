@echo off
cd /d "C:\Users\miran\antigravity\local-ml-weather-predictor"
echo ======================================================== >> benchmarks\auto_verify.log
echo [PrecisionCast Auto-Verify] Running at %DATE% %TIME% >> benchmarks\auto_verify.log
echo ======================================================== >> benchmarks\auto_verify.log
call "C:\Program Files\nodejs\npx.cmd" tsx scripts/weather_validator.ts verify >> benchmarks\auto_verify.log 2>&1
echo [PrecisionCast Auto-Verify] Finished at %DATE% %TIME% >> benchmarks\auto_verify.log
