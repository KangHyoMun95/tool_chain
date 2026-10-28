#!/usr/bin/env bash
set -e

Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
export DISPLAY=:99
sleep 1

# Bật VNC khi cần xem (docker run -e VNC=1)
if [ "${VNC:-0}" = "1" ]; then
  x11vnc -display :99 -nopw -forever -rfbport 5900 -quiet &
fi

bash start_brave.sh

# Chờ Brave mở cổng 9222 rồi mới chạy script
for _ in $(seq 1 30); do
  curl -s http://127.0.0.1:9222/json/version >/dev/null && break
  sleep 1
done

exec python3 main.py