-- Schema khởi tạo (gộp từ V1..V19 cũ). Dùng cho DB mới hoàn toàn.
-- Mọi id là UUID DEFAULT gen_random_uuid() (có sẵn trong PostgreSQL 13+, không cần extension).
-- Riêng game_sessions.game_session_id và predictions.prediction_id do ứng dụng sinh (UUIDv5), không có default.
-- Không đặt dữ liệu ở đây: dữ liệu khởi tạo nằm ở V2, tài khoản tạo bằng CLI (không hardcode hash trong Flyway).

-- ============ Phân quyền & người dùng ============
CREATE TABLE roles (
    role_id   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    role_name VARCHAR(20) NOT NULL UNIQUE
);

CREATE TABLE users (
    user_id       UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    phone_number  VARCHAR(40)  NOT NULL UNIQUE,
    password      VARCHAR(255) NOT NULL,
    role_id       UUID         NOT NULL REFERENCES roles (role_id),
    refer_user_id UUID         REFERENCES users (user_id),
    balance       BIGINT       NOT NULL DEFAULT 0 CHECK (balance >= 0),
    status        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEACTIVE', 'DELETED')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    display_name  VARCHAR(50)  CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 50 AND display_name = btrim(display_name))),
    last_login_at TIMESTAMPTZ
);
CREATE INDEX idx_users_role_id ON users (role_id);
CREATE INDEX idx_users_refer_user_id ON users (refer_user_id);

-- Số điện thoại đăng ký từ portal, chờ HOST cấp tài khoản
CREATE TABLE users_register (
    user_register_id UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    phone_number     VARCHAR(20) NOT NULL UNIQUE,
    created_at       TIMESTAMPTZ
);

-- ============ Danh mục: lobby > category > stream ============
-- Chống trùng theo tên đã chuẩn hóa: biểu thức phải khớp normalizeName() ở api
CREATE TABLE lobbies (
    lobby_id   UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    lobby_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status     VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEACTIVE', 'ARCHIVE'))
);
CREATE UNIQUE INDEX uq_lobbies_name_norm ON lobbies (lower(btrim(regexp_replace(lobby_name, '\s+', ' ', 'g'))));

CREATE TABLE categories (
    category_id   UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    category_name VARCHAR(255) NOT NULL,
    lobby_id      UUID         NOT NULL REFERENCES lobbies (lobby_id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEACTIVE', 'ARCHIVE'))
);
CREATE UNIQUE INDEX uq_categories_lobby_name_norm ON categories (lobby_id, lower(btrim(regexp_replace(category_name, '\s+', ' ', 'g'))));

CREATE TABLE streams (
    stream_id   UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    stream_name VARCHAR(255) NOT NULL,
    category_id UUID         NOT NULL REFERENCES categories (category_id),
    status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEACTIVE', 'ARCHIVE'))
);
CREATE INDEX idx_streams_category_id ON streams (category_id);
CREATE UNIQUE INDEX uq_streams_category_name_norm ON streams (category_id, lower(btrim(regexp_replace(stream_name, '\s+', ' ', 'g'))));

CREATE TABLE stream_information (
    stream_information_id UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    stream_id             UUID         NOT NULL REFERENCES streams (stream_id),
    streamer_id           VARCHAR(255) NOT NULL
);
CREATE UNIQUE INDEX uq_stream_information_stream_id ON stream_information (stream_id);

-- ============ Ván chơi & dự đoán ============
-- road_shoe = stream_shoe, road_count = stream_round của payload crawler
CREATE TABLE game_sessions (
    game_session_id UUID         NOT NULL PRIMARY KEY,
    stream_id       UUID         NOT NULL REFERENCES streams (stream_id),
    road_count      INTEGER,
    result          VARCHAR(50),
    status          VARCHAR(20)  NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'FINISHED', 'CANCELLED')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    road_shoe       INTEGER      NOT NULL,
    ended_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_game_sessions_stream_road_shoe ON game_sessions (stream_id, road_shoe, road_count);
CREATE INDEX idx_game_sessions_stream_created ON game_sessions (stream_id, created_at DESC);
CREATE INDEX idx_game_sessions_running_created ON game_sessions (created_at) WHERE status = 'RUNNING';

CREATE TABLE predictions (
    prediction_id    UUID         NOT NULL PRIMARY KEY,
    stream_id        UUID         NOT NULL REFERENCES streams (stream_id),
    game_session_id  UUID         NOT NULL UNIQUE REFERENCES game_sessions (game_session_id),
    predict_result   VARCHAR(50),
    confidence_score NUMERIC(5,4),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    detail           JSONB        NOT NULL,
    model_version    TEXT         NOT NULL,
    reason           TEXT         NOT NULL,
    CONSTRAINT chk_predictions_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
    CONSTRAINT chk_predictions_pick_reason CHECK ((predict_result IS NOT NULL) = (reason = 'OK')),
    CONSTRAINT chk_predictions_predict_result CHECK (predict_result ~ '^[A-Z]$'),
    CONSTRAINT chk_predictions_reason CHECK (reason IN ('OK', 'NOT_ENOUGH_HISTORY', 'NO_ELIGIBLE_SUFFIX'))
);
CREATE INDEX idx_predictions_stream_id ON predictions (stream_id);
CREATE INDEX idx_predictions_stream_created ON predictions (stream_id, created_at DESC);

-- ============ Billing ============
CREATE TABLE prediction_subscriptions (
    prediction_subscription_id UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                    UUID        NOT NULL REFERENCES users (user_id),
    prediction_id              UUID        NOT NULL REFERENCES predictions (prediction_id),
    fee_amount                 BIGINT      NOT NULL CHECK (fee_amount > 0),
    refunded_at                TIMESTAMPTZ,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at               TIMESTAMPTZ,
    refund_waived_at           TIMESTAMPTZ,
    UNIQUE (user_id, prediction_id),
    CONSTRAINT chk_prediction_subscriptions_refund_once CHECK (refunded_at IS NULL OR refund_waived_at IS NULL)
);
CREATE INDEX idx_prediction_subscriptions_prediction_id ON prediction_subscriptions (prediction_id);
CREATE INDEX idx_prediction_subscriptions_unsettled ON prediction_subscriptions (created_at) WHERE refunded_at IS NULL AND refund_waived_at IS NULL;

CREATE TABLE transactions (
    transaction_id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                      UUID        NOT NULL REFERENCES users (user_id),
    predictions_subscriptions_id UUID        REFERENCES prediction_subscriptions (prediction_subscription_id),
    transaction_type             VARCHAR(20) NOT NULL CHECK (transaction_type IN ('MINT', 'TRANSFER_OUT', 'TRANSFER_IN', 'CHARGE', 'REFUND', 'INVOKE')),
    amount                       BIGINT      NOT NULL CHECK (amount > 0),
    balance_before               BIGINT      NOT NULL,
    balance_after                BIGINT      NOT NULL,
    created_by                   UUID        REFERENCES users (user_id),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_user_created ON transactions (user_id, created_at DESC);
CREATE INDEX idx_transactions_subscription_id ON transactions (predictions_subscriptions_id);

-- ============ Kết nối SSE tham gia stream ============
CREATE TABLE stream_connections (
    stream_connection_id UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id              UUID        NOT NULL REFERENCES users (user_id),
    stream_id            UUID        NOT NULL REFERENCES streams (stream_id),
    opened_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_ping_at         TIMESTAMPTZ,
    closed_at            TIMESTAMPTZ,
    close_reason         VARCHAR(32) CHECK (close_reason IN ('CLIENT_CLOSED', 'PING_FAILED', 'INSUFFICIENT_BALANCE', 'SESSION_REVOKED', 'SERVER_SHUTDOWN', 'SERVER_RESTART')),
    CHECK ((closed_at IS NULL) = (close_reason IS NULL))
);
CREATE INDEX idx_stream_connections_user_opened ON stream_connections (user_id, opened_at);
CREATE INDEX idx_stream_connections_stream_opened ON stream_connections (stream_id, opened_at);
CREATE INDEX idx_stream_connections_open ON stream_connections (stream_connection_id) WHERE closed_at IS NULL;
