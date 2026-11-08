-- Luồng dự đoán: AI có thể không đưa ra dự đoán (thiếu lịch sử / không có đuôi hợp lệ) nên predict_result cho phép NULL,
-- và mỗi prediction lưu thêm chi tiết tính toán (detail), phiên bản mô hình và lý do.
--   detail = {chosen, rows, history_used, missing_previous} (xem PredictionDetail ở packages/shared/src/ai.ts)
-- Bảng predictions phải RỖNG: các cột NOT NULL mới không có giá trị mặc định hợp lý cho dòng cũ.
DO $$
DECLARE n bigint;
BEGIN
    SELECT count(*) INTO n FROM predictions;
    IF n > 0 THEN
        RAISE EXCEPTION 'predictions đang có % dòng, cần xử lý trước khi thêm detail/model_version/reason NOT NULL', n;
    END IF;
END $$;

ALTER TABLE predictions ALTER COLUMN predict_result DROP NOT NULL;
ALTER TABLE predictions
    ADD COLUMN detail        JSONB NOT NULL,
    ADD COLUMN model_version TEXT  NOT NULL,
    ADD COLUMN reason        TEXT  NOT NULL;

ALTER TABLE predictions ADD CONSTRAINT chk_predictions_predict_result
    CHECK (predict_result IN ('B', 'P'));
ALTER TABLE predictions ADD CONSTRAINT chk_predictions_reason
    CHECK (reason IN ('OK', 'NOT_ENOUGH_HISTORY', 'NO_ELIGIBLE_SUFFIX'));
-- Có dự đoán khi và chỉ khi reason = OK.
ALTER TABLE predictions ADD CONSTRAINT chk_predictions_pick_reason
    CHECK ((predict_result IS NOT NULL) = (reason = 'OK'));
ALTER TABLE predictions ADD CONSTRAINT chk_predictions_confidence
    CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1);
