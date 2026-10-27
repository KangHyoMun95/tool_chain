#!/usr/bin/env bash
# Mở Brave ở chế độ cho phép script kết nối vào (remote debugging, cổng 9222).
#
# Dùng thư mục profile RIÊNG (~/.brave-automation), vì Brave/Chromium bản mới
# không cho bật remote debugging trên profile mặc định. Instance này chạy song
# song được với Brave hằng ngày của bạn.
#
# Chạy:  bash start_brave.sh

PROFILE_DIR="$HOME/.brave-automation"
PREFS="$PROFILE_DIR/Default/Preferences"

# Brave ghi đè Preferences khi đang chạy -> phải sửa lúc profile này đang tắt
if pgrep -f -- "--user-data-dir=$PROFILE_DIR" >/dev/null; then
  echo "Brave (profile automation) đang chạy rồi. Tắt nó trước nếu muốn áp lại cài đặt."
  exit 1
fi

# Tắt các hộp "Lưu mật khẩu?", "Lưu địa chỉ/thẻ?" của trình duyệt
mkdir -p "$PROFILE_DIR/Default"
python3 - "$PREFS" <<'EOF'
import json, os, sys
path = sys.argv[1]
prefs = {}
if os.path.exists(path):
    with open(path) as f:
        prefs = json.load(f)

prefs["credentials_enable_service"] = False                       # hỏi lưu mật khẩu
prefs.setdefault("profile", {})["password_manager_enabled"] = False
autofill = prefs.setdefault("autofill", {})
autofill["profile_enabled"] = False                               # hỏi lưu địa chỉ
autofill["credit_card_enabled"] = False                           # hỏi lưu thẻ

with open(path, "w") as f:
    json.dump(prefs, f)
print("Đã tắt hộp lưu mật khẩu / autofill.")
EOF

brave-browser \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-notifications \
  --disable-features=Translate,TranslateUI \
  --lang=vi \
  ${BRAVE_EXTRA_FLAGS} \
  >/tmp/brave.log 2>&1 &

echo "Brave đã mở (PID $!). Kiểm tra: curl -s http://127.0.0.1:9222/json/version"