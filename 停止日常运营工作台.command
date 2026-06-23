#!/bin/zsh

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

pkill -f "$ROOT_DIR/node_modules/electron" 2>/dev/null || true
pkill -f "PETCIRCLE 运营工作台" 2>/dev/null || true

osascript -e 'display notification "工作台已请求停止" with title "PETCIRCLE 运营工作台"' 2>/dev/null || true
