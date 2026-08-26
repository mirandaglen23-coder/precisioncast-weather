$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c "C:\Users\miran\antigravity\local-ml-weather-predictor\scripts\auto_verify.bat"'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date "07:00:00")
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName "PrecisionCast_Morning_Verify" -Action $action -Trigger $trigger -Settings $settings -Force
