import os

import pandas as pd

# Pattern matching
MIN_LEN = 3          # độ dài trượt ngắn nhất
MAX_LEN = 10         # độ dài trượt dài nhất
MIN_COUNT = 3        # số lần xuất hiện tối thiểu để đuôi được xét chọn (total = tổng số lần của các ký hiệu predictable)
# Trọng số theo độ mới: cấu hình (AI_HALF_LIFE, AI_SHOE_WEIGHT) nằm ở bảng job_configs (xem job_config.py), không phải env.
DEFAULT_HALF_LIFE_MINUTES = 60       # dùng khi dòng AI_HALF_LIFE thiếu / không hợp lệ (value NULL = tắt, không phải mặc định)
DEFAULT_SHOE_WEIGHT = 5              # dùng khi dòng AI_SHOE_WEIGHT thiếu / không hợp lệ
CONFIG_REFRESH_SECONDS = 60          # đọc lại job_configs
# Trọng số live = 2^((ts - t0) / half-life); số mũ này vượt ngưỡng ⇒ TỰ dựng lại bảng đếm (đặt lại t0). float64 chịu tới 2^1023: còn dư ~2^123 cho tổng nhiều lần cộng.
# Bán rã 30 phút: 900 × 30 phút = 450 giờ ≈ 18,75 ngày một lần dựng lại; 60 phút ≈ 37,5 ngày; 2 giờ ≈ 75 ngày.
MAX_WEIGHT_EXPONENT = 900
SHOE_WCOUNTS_TTL_SECONDS = 6 * 60 * 60   # ai:wcounts:{stream}:{shoe}
# Dựng lại giữa chừng (đổi AI_HALF_LIFE, gần tràn số mũ, tín hiệu ai:rebuild sau CLEAR_HISTORY): chờ ingestion ghi nốt batch cuối (tối đa ~3s) trước khi đọc DB,
# nếu không bản dựng lại từ DB có thể thiếu những ván vừa đếm bằng đường realtime.
REBUILD_SETTLE_SECONDS = int(os.environ.get("AI_REBUILD_DELAY_S", "5"))
MAX_CONFIDENCE = 0.9    # trần của `confidence` trả ra (chỉ giá trị hiển thị; việc chọn pick vẫn theo % thật)
MAX_GAP = pd.Timedelta(minutes=10)   # chỉ dùng khi dữ liệu thiếu road_shoe (backtest nguồn file cũ)
WINDOW = 10                          # số kết quả trước dùng để đoán kết quả tiếp theo
RESET_ON_ROAD_DROP = True            # road_count giảm = bắt đầu đoạn mới (chỉ khi thiếu road_shoe)
MODEL_PATH = "models/model.joblib"

# Service (Redis)
COUNTED_TTL_SECONDS = 48 * 60 * 60   # ai:counted:{stream_id}:{shoe}
REBUILD_COUNTED_WINDOW_SECONDS = COUNTED_TTL_SECONDS   # dựng lại: chỉ tạo tập counted cho shoe có ván trong khoảng này
MISSING_PREVIOUS_RETRIES = 3         # đọc lại recent khi thiếu round - 1
MISSING_PREVIOUS_DELAY_S = 0.3
# recent:{stream_id}:{shoe} thiếu round ⇒ đọc bù từ DB các ván có result của shoe đó trong số giờ gần nhất này
# (số shoe có thể lặp lại giữa các ngày: không đọc quá xa để không trộn shoe cùng số của ngày khác).
HISTORY_DB_WINDOW_HOURS = int(os.environ.get("AI_HISTORY_DB_WINDOW_HOURS", "6"))
READ_COUNT = 50                      # XREADGROUP COUNT
BLOCK_MS = 2_000
MAX_CONCURRENT_PREDICTIONS = 32
RETRY_DELAY_S = 1.0

