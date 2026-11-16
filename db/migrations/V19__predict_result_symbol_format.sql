-- predictions.predict_result: bỏ CHECK cứng ('B','P') của V9, chỉ ép ĐỊNH DẠNG ký hiệu chung (đúng một chữ in hoa, khớp RESULT_SYMBOL_RE).
-- Việc pick có thuộc `predictable` của category hay không do ứng dụng kiểm tra (config/categories/*.json), không ở DB.
-- NULL vẫn hợp lệ (AI không dự đoán); chk_predictions_pick_reason (V9) vẫn ép "có pick khi và chỉ khi reason = OK".
ALTER TABLE predictions DROP CONSTRAINT chk_predictions_predict_result;
ALTER TABLE predictions ADD CONSTRAINT chk_predictions_predict_result
    CHECK (predict_result ~ '^[A-Z]$');
