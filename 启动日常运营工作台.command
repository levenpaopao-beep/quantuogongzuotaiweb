#!/bin/zsh
set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$APP_DIR/outputs/daily_ops_electron.log"
APP_BUNDLE="$APP_DIR/PETCIRCLE 运营工作台.app"

cd "$APP_DIR"
mkdir -p "$APP_DIR/outputs"

echo "日常运营工作台桌面版"
echo "项目目录：$APP_DIR"
echo "日志文件：$LOG_FILE"
echo

if [ -d "$APP_BUNDLE" ]; then
  echo "正在打开 PETCIRCLE 运营工作台..."
  open "$APP_BUNDLE"
  exit 0
fi

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "缺少 package.json，无法启动 Electron 桌面版。"
  read "?按回车关闭窗口..."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "找不到 npm，请先安装 Node.js。"
  read "?按回车关闭窗口..."
  exit 1
fi

if [ ! -d "$APP_DIR/node_modules/electron" ]; then
  echo "首次启动需要安装桌面运行组件，请稍等..."
  ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install --cache "$APP_DIR/.npm-cache" >> "$LOG_FILE" 2>&1
fi

npm start >> "$LOG_FILE" 2>&1
