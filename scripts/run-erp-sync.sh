#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

PYTHON_BIN="${DAILY_OPS_PYTHON:-/Users/levenwong/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3}"
if [[ ! -x "$PYTHON_BIN" && -x "$ROOT/.venv/bin/python3" ]]; then
  PYTHON_BIN="$ROOT/.venv/bin/python3"
fi

{
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERP auto sync start"
  cd "$ROOT"
  "$PYTHON_BIN" daily_ops_cli.py erp-sync <<< '{"role":"admin"}'
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERP auto sync end"
} >> "$LOG_DIR/erp_sync.log" 2>&1
