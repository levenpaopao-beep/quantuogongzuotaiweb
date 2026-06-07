#!/bin/zsh
set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PY="${PYTHON:-python3}"
URL="http://127.0.0.1:8765"
LOG_DIR="$APP_DIR/outputs"
LOG_FILE="$LOG_DIR/daily_ops_workbench.log"
PID_FILE="$LOG_DIR/daily_ops_workbench.pid"
SERVER_PID=""

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

cleanup_server() {
  if [ -n "${SERVER_PID:-}" ]; then
    if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      echo
      echo "正在停止工作台服务，释放端口..."
      kill "$SERVER_PID" >/dev/null 2>&1 || true
      sleep 1
      if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
        kill -9 "$SERVER_PID" >/dev/null 2>&1 || true
      fi
    fi
  fi
  rm -f "$PID_FILE"
}

wait_port_free() {
  for i in {1..30}; do
    if ! /usr/sbin/lsof -ti tcp:8765 >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

stop_port_processes() {
  PORT_PIDS="$(/usr/sbin/lsof -ti tcp:8765 2>/dev/null || true)"
  if [ -z "$PORT_PIDS" ]; then
    return 0
  fi
  echo "$PORT_PIDS" | while read -r pid; do
    if [ -n "$pid" ]; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  if wait_port_free; then
    return 0
  fi
  echo "旧进程未正常退出，正在强制释放端口..."
  /usr/sbin/lsof -ti tcp:8765 2>/dev/null | while read -r pid; do
    if [ -n "$pid" ]; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  done
  wait_port_free
}

trap cleanup_server EXIT INT TERM HUP

echo "日常运营工作台启动器"
echo "项目目录：$APP_DIR"
echo "打开地址：$URL"
echo "日志文件：$LOG_FILE"
echo

if ! command -v "$PY" >/dev/null 2>&1; then
  echo "找不到 Python 运行环境：$PY"
  echo "请先安装 Python，或通过 PYTHON=/path/to/python 指定运行环境。"
  echo
  read "?按回车关闭窗口..."
  exit 1
fi

if "$PY" - <<'PY' >/dev/null 2>&1
import urllib.request
urllib.request.urlopen("http://127.0.0.1:8765/api/health", timeout=1).read()
PY
then
  echo "工作台已经在运行，正在打开浏览器..."
  /usr/bin/open "$URL"
  echo
  echo "可以直接使用。如果页面没有刷新，请在浏览器里重新打开：$URL"
  read "?按回车关闭窗口..."
  exit 0
fi

PORT_PIDS="$(/usr/sbin/lsof -ti tcp:8765 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
  echo "检测到 8765 端口被旧进程占用，但工作台接口没有正常响应。"
  echo "正在停止旧进程并重新启动..."
  if ! stop_port_processes; then
    echo "8765 端口暂时无法释放，请稍后再试，或把下面的进程号发给 Codex："
    /usr/sbin/lsof -nP -iTCP:8765 -sTCP:LISTEN || true
    read "?按回车关闭窗口..."
    exit 1
  fi
fi

echo "正在启动服务，请稍等..."
: > "$LOG_FILE"
"$PY" -u -W ignore::DeprecationWarning "$APP_DIR/daily_ops_app.py" >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

for i in {1..40}; do
  if "$PY" - <<'PY' >/dev/null 2>&1
import urllib.request
urllib.request.urlopen("http://127.0.0.1:8765/api/health", timeout=1).read()
PY
  then
    echo "工作台已启动，正在打开浏览器..."
    /usr/bin/open "$URL"
    echo
    echo "请保持这个窗口打开。关闭窗口会停止工作台。"
    echo "如果需要手动打开，地址是：$URL"
    echo
    wait "$SERVER_PID"
    exit 0
  fi
  sleep 0.5
done

echo "工作台没有成功启动。"
PORT_PIDS="$(/usr/sbin/lsof -ti tcp:8765 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
  echo "8765 端口仍被占用，进程号：$PORT_PIDS"
fi
echo "最近日志："
echo "----------------------------------------"
tail -n 40 "$LOG_FILE"
echo "----------------------------------------"
kill "$SERVER_PID" >/dev/null 2>&1
rm -f "$PID_FILE"
echo
echo "请把上面的日志发给 Codex，我会继续帮你修。"
read "?按回车关闭窗口..."
