#!/bin/zsh
URL="http://127.0.0.1:8765"
PORT_PIDS="$(/usr/sbin/lsof -ti tcp:8765 2>/dev/null || true)"

echo "日常运营工作台停止器"
echo

if [ -z "$PORT_PIDS" ]; then
  echo "当前没有检测到运行中的工作台。"
  read "?按回车关闭窗口..."
  exit 0
fi

echo "检测到工作台端口正在使用：$URL"
echo "正在停止进程：$PORT_PIDS"
echo "$PORT_PIDS" | while read -r pid; do
  if [ -n "$pid" ]; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
done

sleep 1
if /usr/sbin/lsof -ti tcp:8765 >/dev/null 2>&1; then
  echo "普通停止失败，正在强制停止..."
  /usr/sbin/lsof -ti tcp:8765 | while read -r pid; do
    if [ -n "$pid" ]; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  done
fi

echo "工作台已停止。"
read "?按回车关闭窗口..."
