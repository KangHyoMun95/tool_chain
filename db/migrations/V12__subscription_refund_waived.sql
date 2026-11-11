-- HAS_REFUND=false: settlement không hoàn tiền mà đánh dấu subscription "bỏ hoàn" (refund_waived_at = thời điểm quyết định).
-- Subscription đã bỏ hoàn KHÔNG bao giờ được hoàn nữa, kể cả khi HAS_REFUND bật lại (refund / sweeper / job hủy ván
-- đều lọc refunded_at IS NULL AND refund_waived_at IS NULL). Một subscription chỉ có thể hoặc đã hoàn, hoặc đã bỏ hoàn.
-- Không đổi balance / transactions: bỏ hoàn không phải một giao dịch tiền.
ALTER TABLE prediction_subscriptions ADD COLUMN refund_waived_at timestamptz NULL;

ALTER TABLE prediction_subscriptions
  ADD CONSTRAINT chk_prediction_subscriptions_refund_once CHECK (refunded_at IS NULL OR refund_waived_at IS NULL);

-- Sweeper chỉ quét subscription còn chờ quyết định (chưa hoàn và chưa bỏ hoàn); thay index của V10.
DROP INDEX idx_prediction_subscriptions_unrefunded;
CREATE INDEX idx_prediction_subscriptions_unsettled ON prediction_subscriptions (created_at)
  WHERE refunded_at IS NULL AND refund_waived_at IS NULL;
