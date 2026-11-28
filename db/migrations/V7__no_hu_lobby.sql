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

INSERT INTO categories (category_name, lobby_id, status) VALUES
    ('Phi công',     '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE'),
    ('Mèo may mắn',  '7e475c64-eec2-4efc-997d-877dd4b53d0b', 'ACTIVE')
ON CONFLICT DO NOTHING;

-- Lịch lucky time. category_id NULL = dùng chung cho mọi category của lobby. time_lucky = giờ trong ngày, lặp lại hằng ngày.
-- Import KHÔNG xóa: dòng cũ được đánh dấu replaced_at (NULL = đang hiệu lực).
CREATE TABLE IF NOT EXISTS lucky_time (
    lucky_time_id         UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id           UUID         REFERENCES categories (category_id),
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
-- Truy vấn lịch đang hiệu lực của một category (NULL = dùng chung).
CREATE INDEX IF NOT EXISTS idx_lucky_time_active ON lucky_time (category_id, time_lucky) WHERE replaced_at IS NULL;

-- User đã trả phí xem một lucky time: mỗi user một lần cho mỗi lucky time. fee_amount cùng kiểu với prediction_subscriptions.fee_amount (phí = PREDICTION_FEE lúc trừ).
CREATE TABLE IF NOT EXISTS prediction_user_lucky (
    prediction_user_lucky_id UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  UUID        NOT NULL REFERENCES users (user_id),
    lucky_time_id            UUID        NOT NULL REFERENCES lucky_time (lucky_time_id),
    fee_amount               BIGINT      NOT NULL CHECK (fee_amount > 0),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, lucky_time_id)
);
CREATE INDEX IF NOT EXISTS idx_prediction_user_lucky_lucky_time ON prediction_user_lucky (lucky_time_id);
