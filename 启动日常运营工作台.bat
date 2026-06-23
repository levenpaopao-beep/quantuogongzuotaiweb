@echo off
setlocal

cd /d "%~dp0"

if not exist package.json (
  echo 没有找到工作台项目文件，请确认启动脚本放在 dailywork 文件夹内。
  pause
  exit /b 1
)

if not defined ELECTRON_MIRROR set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

if not exist node_modules\electron (
  npm install
  if errorlevel 1 (
    echo Electron 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

npm start
