import os

import pandas as pd

# Pattern matching
MIN_LEN = 3          # độ dài trượt ngắn nhất
MAX_LEN = 10         # độ dài trượt dài nhất
MIN_COUNT = 3        # số lần xuất hiện tối thiểu để đuôi được xét chọn (total = count_B + count_P)
MAX_GAP = pd.Timedelta(minutes=10)   # chỉ dùng khi dữ liệu thiếu road_shoe (backtest nguồn file cũ)
IGNORE = {"T"}       # kết quả bị bỏ khỏi chuỗi
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
