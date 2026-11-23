import os

import pandas as pd

# Pattern matching
MIN_LEN = 3          # độ dài trượt ngắn nhất
MAX_LEN = 10         # độ dài trượt dài nhất
MIN_COUNT = 3        # số lần xuất hiện tối thiểu để đuôi được xét chọn (total = tổng số lần của các ký hiệu predictable)
# Trọng số theo độ mới: mỗi lần xuất hiện của một pattern có trọng số 2^(-tuổi / half-life), tuổi = thời gian từ lúc ván ra kết quả.
# pct = (1 - BLEND) * tỉ lệ số lần thật + BLEND * tỉ lệ có trọng số ⇒ pattern lặp lại ở lịch sử GẦN thì % cao hơn, lặp lại ở lịch sử cũ thì thấp hơn.
# `counts` / `total` / MIN_COUNT vẫn là số lần THẬT. Không để BLEND = 1: vài lần xuất hiện gần nhất sẽ quyết định cả %, dễ ra % rất cao từ rất ít mẫu.
# HALF_LIFE_HOURS = 0 ⇒ tắt (mọi lần xuất hiện cùng trọng số, như pattern-v1 cũ). Tối thiểu 1 giờ.
RECENCY_HALF_LIFE_HOURS = float(os.environ.get("AI_RECENCY_HALF_LIFE_HOURS", "48"))
RECENCY_BLEND = float(os.environ.get("AI_RECENCY_BLEND", "0.5"))
if RECENCY_HALF_LIFE_HOURS != 0 and RECENCY_HALF_LIFE_HOURS < 1:
    raise ValueError("AI_RECENCY_HALF_LIFE_HOURS phải bằng 0 (tắt) hoặc >= 1")
if not 0 <= RECENCY_BLEND < 1:
    raise ValueError("AI_RECENCY_BLEND phải trong [0, 1)")
MAX_WEIGHT_EXPONENT = 1000           # 2^1000 gần trần của float64: trọng số live tăng theo 2^(giờ chạy / half-life), quá mức này cần restart để dựng lại
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
