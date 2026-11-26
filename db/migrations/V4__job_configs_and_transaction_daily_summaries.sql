-- Job dọn dữ liệu (CLEAR_PREDICT_UNUSE, CLEAR_HISTORY) + bảng tổng hợp giao dịch theo ngày.
--
-- job_configs: cấu hình mỗi job, đọc lại ở MỖI lần chạy (đổi giá trị không cần restart).
--   type tự do (không enum), value NULL = tắt job, unit 'minute' | 'hour' | 'day'. KHÔNG có CHECK cho unit / value:
--   giá trị sai chỉ làm job log WARN và bỏ qua lần chạy.
-- transaction_daily_summaries: tổng hợp CHARGE / REFUND của các ván đã bị CLEAR_HISTORY xóa, theo (user, loại, ngày của giao dịch
--   theo TZ của API). Chỉ có dòng khi (user, loại, ngày) có ít nhất một giao dịch. Chưa dùng ở giao diện.
CREATE TABLE job_configs (
    type       TEXT        NOT NULL PRIMARY KEY,
    value      INTEGER,
    unit       TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO job_configs (type, value, unit) VALUES
    ('CLEAR_PREDICT_UNUSE', 2, 'hour'),
    ('CLEAR_HISTORY', 7, 'day');

CREATE TABLE transaction_daily_summaries (
    user_id          UUID        NOT NULL REFERENCES users (user_id),
    transaction_type TEXT        NOT NULL CHECK (transaction_type IN ('CHARGE', 'REFUND')),
    day              DATE        NOT NULL,
    tx_count         INTEGER     NOT NULL CHECK (tx_count > 0),
    total_amount     BIGINT      NOT NULL CHECK (total_amount > 0),   -- cùng kiểu với transactions.amount
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, transaction_type, day)
);

-- Hai job quét theo created_at (mốc cắt), trước đây chỉ có chỉ mục theo (stream_id, created_at).
CREATE INDEX idx_game_sessions_created_at ON game_sessions (created_at);
CREATE INDEX idx_predictions_created_at ON predictions (created_at);
