-- Cấu hình của AI trong bảng job_configs (bảng do V4 tạo, dùng chung cho mọi job / service). AI (apps/ai) cần quyền SELECT trên bảng này.
--   AI_HALF_LIFE   (unit 'minute' | 'hour'): bán rã của trọng số theo độ mới; value NULL = tắt trọng số (chạy đúng pattern-v1). Mặc định 60 phút.
--   AI_SHOE_WEIGHT (unit 'times'): hệ số nhân của shoe hiện tại, số nguyên >= 1 (1 = không ưu tiên shoe hiện tại). Mặc định 5.
-- Dòng thiếu / giá trị sai: AI log WARN và dùng mặc định.
INSERT INTO job_configs (type, value, unit) VALUES
    ('AI_HALF_LIFE', 60, 'minute'),
    ('AI_SHOE_WEIGHT', 5, 'times')
ON CONFLICT (type) DO NOTHING;

-- Tắt hai job dọn dữ liệu (CLEAR_PREDICT_UNUSE, CLEAR_HISTORY) cho tới khi được xác nhận bật: value NULL = tắt (job bỏ qua, log DEBUG).
-- Bật lại bằng SQL, ví dụ: UPDATE job_configs SET value = 7, updated_at = now() WHERE type = 'CLEAR_HISTORY';  (unit giữ nguyên 'day')
UPDATE job_configs SET value = NULL, updated_at = now() WHERE type IN ('CLEAR_PREDICT_UNUSE', 'CLEAR_HISTORY');
