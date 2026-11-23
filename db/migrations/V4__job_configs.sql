-- Cấu hình chạy của các job / service, đọc lại định kỳ (không cần restart). Hiện dùng cho AI (apps/ai, trọng số theo độ mới của pattern-v1):
--   AI_HALF_LIFE   (unit 'minute' | 'hour'): bán rã của trọng số theo độ mới; config_value NULL = tắt trọng số (chạy đúng pattern-v1).
--   AI_SHOE_WEIGHT (unit 'times'): hệ số nhân của shoe hiện tại trong trọng số, số nguyên >= 1 (1 = không ưu tiên shoe hiện tại).
-- Giá trị không hợp lệ hoặc thiếu dòng: AI log WARN và dùng mặc định (60 phút, 5). AI cần quyền SELECT trên bảng này.
CREATE TABLE job_configs (
    config_key   VARCHAR(100) PRIMARY KEY,
    config_value INTEGER,
    unit         VARCHAR(20) NOT NULL,
    CONSTRAINT job_configs_value_positive CHECK (config_value IS NULL OR config_value >= 1),
    CONSTRAINT job_configs_unit_valid CHECK (unit IN ('minute', 'hour', 'times'))
);

INSERT INTO job_configs (config_key, config_value, unit) VALUES
    ('AI_HALF_LIFE', 60, 'minute'),
    ('AI_SHOE_WEIGHT', 5, 'times');
