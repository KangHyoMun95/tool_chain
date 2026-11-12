-- Nguyên nhân cấp điểm (người cấp nhập tùy chọn, hiện ở lịch sử cấp điểm). NULL = không ghi (giao dịch cũ, CHARGE, REFUND).
ALTER TABLE transactions ADD COLUMN reason VARCHAR(200);
ALTER TABLE transactions ADD CONSTRAINT transactions_reason_check
    CHECK (reason IS NULL OR (char_length(reason) BETWEEN 1 AND 200 AND reason = btrim(reason)));
