#!/usr/bin/env bash
# Tắt Brave automation (profile ~/.brave-automation).
# Không ảnh hưởng tới Brave hằng ngày của bạn.
#
# Chạy:  bash stop_brave.sh

PROFILE_DIR="$HOME/.brave-automation"
PATTERN="--user-data-dir=$PROFILE_DIR"

if ! pgrep -f -- "$PATTERN" >/dev/null; then
  echo "Brave automation không chạy."
  exit 0
fi

# Tắt nhẹ nhàng (SIGTERM) để Brave kịp lưu profile
pkill -f -- "$PATTERN"

# Chờ tối đa 10 giây cho tắt hẳn
for _ in $(seq 1 10); do
  pgrep -f -- "$PATTERN" >/dev/null || { echo "Đã tắt Brave automation."; exit 0; }
  sleep 1
done

# Vẫn còn thì buộc tắt
echo "Brave không tự tắt, buộc tắt..."
pkill -9 -f -- "$PATTERN"
echo "Đã buộc tắt."