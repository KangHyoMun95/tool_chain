-- Thêm loại giao dịch INVOKE: thu hồi điểm của user bị xóa về cấp trên (HOST/ADMIN xóa cấp dưới).
-- CHECK của V1 không đặt tên nên tìm theo định nghĩa thay vì đoán tên.
DO $$
DECLARE c text;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'transactions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%transaction_type%'
    LOOP
        EXECUTE format('ALTER TABLE transactions DROP CONSTRAINT %I', c);
    END LOOP;
END $$;

ALTER TABLE transactions
    ADD CONSTRAINT transactions_transaction_type_check
    CHECK (transaction_type IN ('MINT', 'TRANSFER_OUT', 'TRANSFER_IN', 'CHARGE', 'REFUND', 'INVOKE'));
