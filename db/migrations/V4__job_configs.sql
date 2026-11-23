-- Cấu hình chạy của các job / service, đọc lại định kỳ (đổi giá trị không cần restart). Dùng chung cho mọi job (schema trùng với nhánh job dọn dữ liệu):
--   type tự do (không enum), value NULL = tắt, unit tùy khóa ('minute' | 'hour' | 'day' | 'times'). KHÔNG có CHECK: giá trị sai chỉ làm job / service
--   log WARN và dùng mặc định / bỏ qua.
-- Dòng của AI (apps/ai, trọng số theo độ mới của pattern-v1; AI cần quyền SELECT trên bảng này):
--   AI_HALF_LIFE   (unit 'minute' | 'hour'): bán rã của trọng số; value NULL = tắt trọng số (chạy đúng pattern-v1).
--   AI_SHOE_WEIGHT (unit 'times'): hệ số nhân của shoe hiện tại, số nguyên >= 1 (1 = không ưu tiên shoe hiện tại).
-- Nếu bảng đã có từ migration khác merge trước: bỏ CREATE TABLE, giữ INSERT (đổi số version của file này cho tiếp nối).
CREATE TABLE job_configs (
    type       TEXT        NOT NULL PRIMARY KEY,
    value      INTEGER,
    unit       TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO job_configs (type, value, unit) VALUES
    ('AI_HALF_LIFE', 60, 'minute'),
    ('AI_SHOE_WEIGHT', 5, 'times')
ON CONFLICT (type) DO NOTHING;
