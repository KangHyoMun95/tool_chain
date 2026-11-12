-- Danh sách bàn (GET /categories/:id/stream-stats) lấy dự đoán mới nhất của từng stream bằng ORDER BY created_at DESC LIMIT 1:
-- cần index (stream_id, created_at DESC) để không phải quét hết dự đoán của stream.
CREATE INDEX IF NOT EXISTS idx_predictions_stream_created ON predictions (stream_id, created_at DESC);
