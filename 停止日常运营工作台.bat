@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:8765/api/shutdown' -ContentType 'application/json' -Body '{\"reason\":\"windows-stop-bat\"}' | Out-Null; Write-Host '日常运营工作台已发送关闭指令。' } catch { Write-Host '未检测到正在运行的工作台，或工作台已关闭。' }"
pause
