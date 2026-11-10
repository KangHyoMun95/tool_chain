-- Billing (phase 1): trừ tiền khi có dự đoán, hoàn tiền khi dự đoán sai / ván bị hủy, nhật ký kết nối SSE tham gia stream.
--   prediction_subscriptions.delivered_at : thời điểm đẩy pick thành công tới ít nhất một kết nối của user (best effort, NULL = chưa giao)
--   game_sessions.ended_at                : thời điểm ván chuyển sang FINISHED / CANCELLED (sweeper hoàn tiền dùng; dòng cũ NULL)
--   stream_connections                    : mỗi kết nối SSE tham gia stream một dòng (mở / ping cuối / đóng + lý do)
-- Các ràng buộc tiền đã có từ V1 (users.balance >= 0, fee_amount > 0, amount > 0, CHARGE/REFUND, UNIQUE (user_id, prediction_id),
-- FK transactions.predictions_subscriptions_id) nên không thêm lại.

-- Chưa từng có luồng trừ tiền: còn dữ liệu subscription / CHARGE / REFUND nghĩa là có dữ liệu lạ, dừng để xử lý tay.
DO $$
DECLARE subs bigint; txs bigint;
BEGIN
    SELECT count(*) INTO subs FROM prediction_subscriptions;
    SELECT count(*) INTO txs FROM transactions WHERE transaction_type IN ('CHARGE', 'REFUND') OR predictions_subscriptions_id IS NOT NULL;
    IF subs > 0 OR txs > 0 THEN
        RAISE EXCEPTION 'prediction_subscriptions có % dòng, transactions CHARGE/REFUND có % dòng: cần kiểm tra trước khi bật billing', subs, txs;
    END IF;
END $$;

ALTER TABLE prediction_subscriptions ADD COLUMN delivered_at TIMESTAMPTZ;
-- Sweeper chỉ quét subscription chưa hoàn (gần đây).
CREATE INDEX idx_prediction_subscriptions_unrefunded ON prediction_subscriptions (created_at) WHERE refunded_at IS NULL;

ALTER TABLE game_sessions ADD COLUMN ended_at TIMESTAMPTZ;
-- Job hủy ván quét các ván RUNNING cũ.
CREATE INDEX idx_game_sessions_running_created ON game_sessions (created_at) WHERE status = 'RUNNING';

CREATE TABLE stream_connections (
    stream_connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID        NOT NULL REFERENCES users (user_id),
    stream_id            UUID        NOT NULL REFERENCES streams (stream_id),
    opened_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_ping_at         TIMESTAMPTZ,
    closed_at            TIMESTAMPTZ,
    close_reason         VARCHAR(32)
        CHECK (close_reason IN ('CLIENT_CLOSED', 'PING_FAILED', 'INSUFFICIENT_BALANCE', 'SESSION_REVOKED', 'SERVER_SHUTDOWN', 'SERVER_RESTART')),
    CHECK ((closed_at IS NULL) = (close_reason IS NULL))
);
CREATE INDEX idx_stream_connections_user_opened ON stream_connections (user_id, opened_at);
CREATE INDEX idx_stream_connections_stream_opened ON stream_connections (stream_id, opened_at);
CREATE INDEX idx_stream_connections_open ON stream_connections (stream_connection_id) WHERE closed_at IS NULL;
