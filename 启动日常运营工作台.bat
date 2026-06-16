@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "%~dp0package.json" (
  echo 缺少 package.json，无法启动 Electron 桌面版。
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo 找不到 npm，请先安装 Node.js。
  pause
  exit /b 1
)

if not exist "%~dp0node_modules\electron" (
  echo 首次启动需要安装桌面运行组件，请稍等...
  set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
  npm install --cache "%~dp0.npm-cache"
)

echo Starting Daily Ops Electron Desktop...
npm start
