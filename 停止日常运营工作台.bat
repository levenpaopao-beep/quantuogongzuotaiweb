@echo off
setlocal

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Resolve-Path '.').Path; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root) -and ($_.Name -like '*electron*' -or $_.Name -like '*node*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"

echo 工作台已请求停止。
