@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PY=%~dp0runtime\python\python.exe"

if not exist "%PY%" (
  set "PY=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
)

if not exist "%PY%" (
  echo Python runtime not found:
  echo %PY%
  echo.
  pause
  exit /b 1
)

set "PYTHONPATH=%~dp0vendor"
start "Daily Ops Service - keep this window open" cmd /k ""%PY%" -W ignore::DeprecationWarning "%~dp0daily_ops_app.py""

echo Starting Daily Ops Workbench...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok=$false; for($i=0;$i -lt 30;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 1; if($r.StatusCode -eq 200){$ok=$true; break} } catch { Start-Sleep -Milliseconds 500 } }; if($ok){ Start-Process 'http://127.0.0.1:8765' } else { Write-Host 'Service did not start. Check the service window for errors.'; pause }"
