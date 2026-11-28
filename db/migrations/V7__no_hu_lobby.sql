-- Lobby "NỔ HŨ" (không có crawler / stream): lịch "lucky time" do HOST import từ file Excel, user chọn category để vào trang chi tiết riêng.
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING): an toàn khi chạy out-of-order hoặc chạy lại.
-- UUID của lobby là hằng số NO_HU_LOBBY_ID ở packages/shared/src/auth.ts: HAI NƠI PHẢI KHỚP NHAU.

INSERT INTO lobbies (lobby_id, lobby_name, status)
VALUES ('7e475c64-eec2-4efc-997d-877dd4b53d0b', 'NỔ HŨ', 'ACTIVE')
ON CONFLICT DO NOTHING;

-- Tên lobby đã có (unique theo tên chuẩn hóa) nhưng khác UUID ⇒ hằng số NO_HU_LOBBY_ID sẽ lệch DB: dừng migration thay vì để lệch âm thầm.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM lobbies WHERE lobby_id = '7e475c64-eec2-4efc-997d-877dd4b53d0b') THEN
        RAISE EXCEPTION 'Lobby "NỔ HŨ" đã tồn tại với lobby_id khác 7e475c64-eec2-4efc-997d-877dd4b53d0b (xem NO_HU_LOBBY_ID ở packages/shared/src/auth.ts)';
    END IF;
END $$;

-- category_name lưu MÃ game (UPPER_SNAKE_CASE); tên hiển thị vi / en và ảnh nằm ở NO_HU_GAMES (packages/shared/src/no-hu-games.ts).
-- sort_order = thứ tự hiển thị (NULL = category của lobby khác, xếp sau theo tên).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER;

INSERT INTO categories (category_name, lobby_id, status, sort_order) VALUES
    ('GATES_OF_OLYMPUS', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 1),
    ('FORTUNE_TIGER', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 2),
    ('AVIATOR', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 3),
    ('MAHJONG_WAYS', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 4),
    ('FORTUNE_GEMS_2', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 5),
    ('WILD_BOUNTY_SHOWDOWN', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 6),
    ('FORTUNE_GEMS_3', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 7),
    ('LUCKY_NEKO', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 8),
    ('GOLDEN_EMPIRE', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 9),
    ('SUPER_ACE', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 10),
    ('TREASURES_OF_AZTEC', '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE', 11)
ON CONFLICT DO NOTHING;
-- Chạy lại (hoặc category đã có từ trước): bảo đảm sort_order đúng theo MÃ.
UPDATE categories c SET sort_order = v.n
FROM (VALUES ('GATES_OF_OLYMPUS', 1), ('FORTUNE_TIGER', 2), ('AVIATOR', 3), ('MAHJONG_WAYS', 4), ('FORTUNE_GEMS_2', 5), ('WILD_BOUNTY_SHOWDOWN', 6), ('FORTUNE_GEMS_3', 7), ('LUCKY_NEKO', 8), ('GOLDEN_EMPIRE', 9), ('SUPER_ACE', 10), ('TREASURES_OF_AZTEC', 11)) AS v(code, n)
WHERE c.lobby_id = '7e475c64-eec2-4efc-997d-877dd4b53d0b' AND c.category_name = v.code AND c.sort_order IS DISTINCT FROM v.n;

-- Lịch lucky time: mỗi dòng thuộc đúng một category (không có lịch dùng chung). time_lucky = giờ trong ngày, lặp lại hằng ngày.
-- Import KHÔNG xóa: dòng cũ được đánh dấu replaced_at (NULL = đang hiệu lực).
CREATE TABLE IF NOT EXISTS lucky_time (
    lucky_time_id         UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id           UUID         NOT NULL REFERENCES categories (category_id),
    time_lucky            TIME         NOT NULL,
    confidence            INTEGER      CHECK (confidence BETWEEN 0 AND 100),
    indicator             TEXT,
    circle_est_from       INTEGER      CHECK (circle_est_from >= 0),
    circle_est_to         INTEGER      CHECK (circle_est_to >= 0),
    range_lucky_time_from INTEGER      CHECK (range_lucky_time_from >= 0),
    range_lucky_time_to   INTEGER      CHECK (range_lucky_time_to >= 0),
    trace_next_circle     INTEGER      CHECK (trace_next_circle >= 0),
    fluctuations_rtp      NUMERIC(5,2),
    replaced_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_lucky_time_circle_order CHECK (circle_est_from IS NULL OR circle_est_to IS NULL OR circle_est_from <= circle_est_to),
    CONSTRAINT chk_lucky_time_range_pair CHECK ((range_lucky_time_from IS NULL) = (range_lucky_time_to IS NULL)),
    CONSTRAINT chk_lucky_time_range_order CHECK (range_lucky_time_from IS NULL OR range_lucky_time_from <= range_lucky_time_to)
);
-- Mỗi (category, giờ) chỉ có MỘT dòng đang hiệu lực (replaced_at IS NULL); cũng là index tra lịch đang hiệu lực của một category.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lucky_time_active ON lucky_time (category_id, time_lucky) WHERE replaced_at IS NULL;

-- User đã trả phí xem một khung giờ: mỗi user một lần cho mỗi (category, time_lucky, lucky_date).
-- Lịch lặp lại hằng ngày nên khóa theo NGÀY (lucky_date, theo TZ hệ thống; trước dòng đầu tiên của ngày thì là ngày hôm qua),
-- và theo (category, time_lucky) chứ không theo lucky_time_id để HOST import lại giữa khung giờ không bắt user trả lại.
-- lucky_time_id giữ lại để biết dòng nào đã được xem. fee_amount cùng kiểu prediction_subscriptions.fee_amount (PREDICTION_FEE lúc trừ).
-- KHÔNG BAO GIỜ HOÀN TIỀN lượt này (không có prediction_subscriptions, settlement không đụng tới).
CREATE TABLE IF NOT EXISTS prediction_user_lucky (
    prediction_user_lucky_id UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  UUID        NOT NULL REFERENCES users (user_id),
    category_id              UUID        NOT NULL REFERENCES categories (category_id),
    time_lucky               TIME        NOT NULL,
    lucky_date               DATE        NOT NULL,
    lucky_time_id            UUID        NOT NULL REFERENCES lucky_time (lucky_time_id),
    fee_amount               BIGINT      NOT NULL CHECK (fee_amount > 0),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, category_id, time_lucky, lucky_date)
);
CREATE INDEX IF NOT EXISTS idx_prediction_user_lucky_lucky_time ON prediction_user_lucky (lucky_time_id);

-- Giao dịch trừ tiền của lượt xem lucky time trỏ về prediction_user_lucky (CHARGE có ĐÚNG MỘT trong hai cột liên kết).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS prediction_user_lucky_id UUID REFERENCES prediction_user_lucky (prediction_user_lucky_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_lucky_id ON transactions (prediction_user_lucky_id);
-- Trước V7 transactions chỉ có CHECK danh sách transaction_type, không ràng buộc cột liên kết.
-- Mới: CHARGE có đúng một trong predictions_subscriptions_id / prediction_user_lucky_id; REFUND phải có predictions_subscriptions_id
-- (và không có prediction_user_lucky_id: lượt lucky không bao giờ hoàn); loại khác không có prediction_user_lucky_id.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_link') THEN
        ALTER TABLE transactions ADD CONSTRAINT chk_transactions_link CHECK (
            (transaction_type = 'CHARGE' AND (predictions_subscriptions_id IS NULL) <> (prediction_user_lucky_id IS NULL))
            OR (transaction_type = 'REFUND' AND predictions_subscriptions_id IS NOT NULL AND prediction_user_lucky_id IS NULL)
            OR (transaction_type NOT IN ('CHARGE', 'REFUND') AND prediction_user_lucky_id IS NULL));
    END IF;
END $$;
