# apps/ai — dự đoán pattern-v1

Service Python đọc kết quả từng ván, đếm pattern theo stream và trả dự đoán qua Redis Stream. **Chỉ ĐỌC DB** (`game_sessions`); không ghi bảng nghiệp vụ nào. Chi tiết luồng và contract: mục "Luồng dự đoán AI" trong `CLAUDE.md`.

- `src/patterns/` — code của service (thuật toán, bảng đếm Redis, consumer, backtest).
- `src/ai/` — thử nghiệm (LightGBM...), KHÔNG dùng cho service, không sửa / import.
- Không phụ thuộc `src/patterns/data/` (dữ liệu offline cho backtest); service đọc DB và Redis.

## Chạy

```bash
cd apps/ai
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                 # điền REDIS_URL, DATABASE_URL(_READONLY)

python main.py serve                 # service (mặc định)
python main.py backtest [--source file|db] [--refresh]
python main.py verify                # so bảng đếm Redis với đếm brute-force từ DB
python main.py predict               # in dự đoán một lần cho các stream đang hoạt động
```

Docker: service `ai` trong `docker-compose.yml` (build từ thư mục này, chạy `python main.py serve`).

## Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `REDIS_URL` | Redis của hệ thống (bắt buộc) |
| `DATABASE_URL_READONLY` | DB URL của user chỉ có SELECT (ưu tiên); trống thì dùng `DATABASE_URL` |
| `DATABASE_URL` | DB URL dự phòng |
| `AI_CONSUMER_NAME` | Tên consumer cố định (mặc định hostname). Không chạy hai instance trùng tên, không dùng `--scale` |
| `AI_ARTIFICIAL_DELAY_MS` | Chỉ để thử: trì hoãn mỗi dự đoán N ms (kiểm tra hạn chót DONE ở API) |
| `LOG_LEVEL` | Mặc định `INFO` |

### User DB chỉ đọc

Mật khẩu không đặt trong migration, nên tạo role thủ công (chạy bằng tài khoản quản trị của DB), rồi đặt `DATABASE_URL_READONLY`:

```sql
CREATE ROLE ai_readonly LOGIN PASSWORD '<mật khẩu mạnh>';
GRANT CONNECT ON DATABASE <tên_db> TO ai_readonly;
GRANT USAGE ON SCHEMA public TO ai_readonly;
GRANT SELECT ON game_sessions TO ai_readonly;
```

Service chỉ cần `SELECT` trên `game_sessions` (`status`, `result`, `road_shoe`, `road_count`, `stream_id`, `created_at`).

## Vận hành

- **Khởi động:** tạo consumer group (`ai-counter`, `ai-predictor`) ở `$`, dựng lại bảng đếm từ DB, rồi mới consume. Muốn dựng lại thì restart service. Kết quả vài giây cuối chưa kịp ghi DB (batch tối đa 3s) có thể thiếu trong lần dựng lại; chúng vẫn được đếm khi message `ai:results` tới.
- **Tắt / sập:** message chưa ack nằm trong PEL và được xử lý khi chạy lại. Dự đoán về sau khi ván đã `DONE` bị API bỏ (log `late_prediction`).
- **`verify`:** chênh lệch nhỏ có thể bình thường khi ván mới chưa kịp ghi DB (Redis nhỉnh hơn DB). Lệch lớn hoặc kéo dài là lỗi đếm.

## Backtest — đọc kết quả thế nào

`python main.py backtest` dùng chung hàm `choose_pick` với service, mỗi ván chỉ dùng dữ liệu trước nó, và so với baseline "chọn kết quả nhiều hơn trong lịch sử stream". In kèm độ phủ (số ván có dự đoán / tổng số ván). Ván ra `T` không tính đúng/sai.

- File `data/sessions.parquet` cũ thiếu `road_shoe`: backtest dùng cách chia chuỗi theo khoảng cách thời gian / `road_count` giảm và in cảnh báo. Dùng `--source db` (hoặc `--refresh`) để có chia theo shoe thật.
- Lần đo gần nhất trên file hiện có (5437 ván, 27 stream): pattern-v1 ≈ 50.0% đúng, baseline ≈ 50.3%, trong khi `% hiển thị` trung bình ≈ 74%. Nghĩa là trên dữ liệu đó mô hình chưa có khả năng dự đoán và `confidence` không phản ánh tỉ lệ đúng thực tế. Đo lại trên dữ liệu shoe thật trước khi dựa vào `confidence`.
