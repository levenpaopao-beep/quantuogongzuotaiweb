#!/bin/zsh
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [ ! -f "package.json" ]; then
  osascript -e 'display alert "没有找到工作台项目文件" message "请确认启动脚本放在 dailywork 文件夹内。"'
  exit 1
fi

export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"

if [ ! -d "node_modules/electron" ]; then
  npm install
fi

npm start
