import pandas as pd

# Pattern matching
MIN_LEN = 3          # độ dài trượt ngắn nhất
MAX_LEN = 10         # độ dài trượt dài nhất
MIN_COUNT = 3        # số lần xuất hiện tối thiểu để được xét chọn
MAX_GAP = pd.Timedelta(minutes=10)
IGNORE = {"T"}       # kết quả bị bỏ khỏi chuỗi
WINDOW = 10                          # số kết quả trước dùng để đoán kết quả tiếp theo
RESET_ON_ROAD_DROP = True            # road_count giảm = bắt đầu đoạn mới
MODEL_PATH = "models/model.joblib"