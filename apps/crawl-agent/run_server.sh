#!/usr/bin/env bash
set -e

# Khóa X còn lại từ lần chạy trước (docker restart giữ nguyên /tmp) sẽ làm Xvfb không lên
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
export DISPLAY=:99
for _ in $(seq 1 20); do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.5; done
[ -S /tmp/.X11-unix/X99 ] || { echo "Xvfb không khởi động được (display :99)"; exit 1; }

# Bật VNC khi cần xem (docker run -e VNC=1)
if [ "${VNC:-0}" = "1" ]; then
  x11vnc -display :99 -nopw -forever -rfbport 5900 -quiet &
fi

bash start_brave.sh

# Chờ Brave mở cổng 9222 rồi mới chạy script
up=0
for _ in $(seq 1 30); do
  curl -s http://127.0.0.1:9222/json/version >/dev/null && { up=1; break; }
  sleep 1
done
# Không có browser thì dừng hẳn để Docker restart, đừng chạy main.py khi không có Brave
if [ "$up" != 1 ]; then
  echo "Brave không mở được cổng 9222. 20 dòng cuối /tmp/brave.log:"
  tail -n 20 /tmp/brave.log
  exit 1
fi

exec python3 main.py