-- Lịch sử dự đoán của một user ở web-admin (GET /admin/users/:userId/prediction-history):
-- lọc theo user_id và duyệt theo thời gian. Trước đó prediction_subscriptions chỉ có UNIQUE (user_id, prediction_id).
-- Idempotent: an toàn khi chạy lại.
CREATE INDEX IF NOT EXISTS idx_prediction_subscriptions_user_created
    ON prediction_subscriptions (user_id, created_at DESC);
