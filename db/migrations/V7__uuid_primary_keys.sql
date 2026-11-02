-- Đổi mọi id (bigint identity) sang UUID DEFAULT gen_random_uuid(), giữ nguyên các khóa ngoại.
-- Phạm vi: users, lobbies, categories, streams, stream_information, stream_participants,
-- prediction_subscriptions, transactions. roles.role_id (SMALLINT, 3 dòng cố định) giữ nguyên;
-- game_sessions và predictions vốn đã dùng UUID sinh trong code.
--
-- DỮ LIỆU BỊ XÓA: các bảng trên được TRUNCATE (đã thống nhất là dữ liệu test có thể xóa). Tài khoản user,
-- session đang đăng nhập và cache id trong Redis (lobby:*, category:*, stream:*) không còn hợp lệ.
-- HOST mặc định được seed lại ở cuối file, giống V4 (mật khẩu ban đầu đã biết — xem cảnh báo ở V4).
-- Chạy trong một transaction của Flyway: lỗi ở bước nào thì rollback toàn bộ.

TRUNCATE transactions, prediction_subscriptions, stream_participants, predictions, game_sessions,
         stream_information, streams, categories, lobbies, users RESTART IDENTITY;

-- 1) Bỏ các khóa ngoại trỏ vào / xuất phát từ cột sẽ đổi kiểu.
ALTER TABLE users                    DROP CONSTRAINT users_refer_user_id_fkey;
ALTER TABLE categories               DROP CONSTRAINT categories_lobby_id_fkey;
ALTER TABLE streams                  DROP CONSTRAINT streams_category_id_fkey;
ALTER TABLE stream_information       DROP CONSTRAINT stream_information_stream_id_fkey;
ALTER TABLE game_sessions            DROP CONSTRAINT game_sessions_stream_id_fkey;
ALTER TABLE predictions              DROP CONSTRAINT predictions_stream_id_fkey;
ALTER TABLE stream_participants      DROP CONSTRAINT stream_participants_user_id_fkey;
ALTER TABLE stream_participants      DROP CONSTRAINT stream_participants_stream_id_fkey;
ALTER TABLE prediction_subscriptions DROP CONSTRAINT prediction_subscriptions_user_id_fkey;
ALTER TABLE transactions             DROP CONSTRAINT transactions_user_id_fkey;
ALTER TABLE transactions             DROP CONSTRAINT transactions_predictions_subscriptions_id_fkey;
ALTER TABLE transactions             DROP CONSTRAINT transactions_created_by_fkey;

-- 2) Khóa chính: bỏ identity, đổi kiểu, mặc định gen_random_uuid().
ALTER TABLE users ALTER COLUMN user_id DROP IDENTITY;
ALTER TABLE users ALTER COLUMN user_id TYPE UUID USING gen_random_uuid();
ALTER TABLE users ALTER COLUMN user_id SET DEFAULT gen_random_uuid();

ALTER TABLE lobbies ALTER COLUMN lobby_id DROP IDENTITY;
ALTER TABLE lobbies ALTER COLUMN lobby_id TYPE UUID USING gen_random_uuid();
ALTER TABLE lobbies ALTER COLUMN lobby_id SET DEFAULT gen_random_uuid();

ALTER TABLE categories ALTER COLUMN category_id DROP IDENTITY;
ALTER TABLE categories ALTER COLUMN category_id TYPE UUID USING gen_random_uuid();
ALTER TABLE categories ALTER COLUMN category_id SET DEFAULT gen_random_uuid();

ALTER TABLE streams ALTER COLUMN stream_id DROP IDENTITY;
ALTER TABLE streams ALTER COLUMN stream_id TYPE UUID USING gen_random_uuid();
ALTER TABLE streams ALTER COLUMN stream_id SET DEFAULT gen_random_uuid();

ALTER TABLE stream_information ALTER COLUMN stream_information_id DROP IDENTITY;
ALTER TABLE stream_information ALTER COLUMN stream_information_id TYPE UUID USING gen_random_uuid();
ALTER TABLE stream_information ALTER COLUMN stream_information_id SET DEFAULT gen_random_uuid();

ALTER TABLE stream_participants ALTER COLUMN stream_participant_id DROP IDENTITY;
ALTER TABLE stream_participants ALTER COLUMN stream_participant_id TYPE UUID USING gen_random_uuid();
ALTER TABLE stream_participants ALTER COLUMN stream_participant_id SET DEFAULT gen_random_uuid();

ALTER TABLE prediction_subscriptions ALTER COLUMN prediction_subscription_id DROP IDENTITY;
ALTER TABLE prediction_subscriptions ALTER COLUMN prediction_subscription_id TYPE UUID USING gen_random_uuid();
ALTER TABLE prediction_subscriptions ALTER COLUMN prediction_subscription_id SET DEFAULT gen_random_uuid();

ALTER TABLE transactions ALTER COLUMN transaction_id DROP IDENTITY;
ALTER TABLE transactions ALTER COLUMN transaction_id TYPE UUID USING gen_random_uuid();
ALTER TABLE transactions ALTER COLUMN transaction_id SET DEFAULT gen_random_uuid();

-- 3) Cột khóa ngoại (bảng đã rỗng nên USING NULL an toàn).
ALTER TABLE users                    ALTER COLUMN refer_user_id TYPE UUID USING NULL;
ALTER TABLE categories               ALTER COLUMN lobby_id TYPE UUID USING NULL;
ALTER TABLE streams                  ALTER COLUMN category_id TYPE UUID USING NULL;
ALTER TABLE stream_information       ALTER COLUMN stream_id TYPE UUID USING NULL;
ALTER TABLE game_sessions            ALTER COLUMN stream_id TYPE UUID USING NULL;
ALTER TABLE predictions              ALTER COLUMN stream_id TYPE UUID USING NULL;
ALTER TABLE stream_participants      ALTER COLUMN user_id TYPE UUID USING NULL;
ALTER TABLE stream_participants      ALTER COLUMN stream_id TYPE UUID USING NULL;
ALTER TABLE prediction_subscriptions ALTER COLUMN user_id TYPE UUID USING NULL;
ALTER TABLE transactions             ALTER COLUMN user_id TYPE UUID USING NULL;
ALTER TABLE transactions             ALTER COLUMN predictions_subscriptions_id TYPE UUID USING NULL;
ALTER TABLE transactions             ALTER COLUMN created_by TYPE UUID USING NULL;

-- 4) Tạo lại các khóa ngoại (cùng tên mặc định như V1).
ALTER TABLE users                    ADD CONSTRAINT users_refer_user_id_fkey FOREIGN KEY (refer_user_id) REFERENCES users (user_id);
ALTER TABLE categories               ADD CONSTRAINT categories_lobby_id_fkey FOREIGN KEY (lobby_id) REFERENCES lobbies (lobby_id);
ALTER TABLE streams                  ADD CONSTRAINT streams_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories (category_id);
ALTER TABLE stream_information       ADD CONSTRAINT stream_information_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES streams (stream_id);
ALTER TABLE game_sessions            ADD CONSTRAINT game_sessions_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES streams (stream_id);
ALTER TABLE predictions              ADD CONSTRAINT predictions_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES streams (stream_id);
ALTER TABLE stream_participants      ADD CONSTRAINT stream_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (user_id);
ALTER TABLE stream_participants      ADD CONSTRAINT stream_participants_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES streams (stream_id);
ALTER TABLE prediction_subscriptions ADD CONSTRAINT prediction_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (user_id);
ALTER TABLE transactions             ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (user_id);
ALTER TABLE transactions             ADD CONSTRAINT transactions_predictions_subscriptions_id_fkey
    FOREIGN KEY (predictions_subscriptions_id) REFERENCES prediction_subscriptions (prediction_subscription_id);
ALTER TABLE transactions             ADD CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (user_id);

-- 5) Seed lại HOST mặc định (như V4).
INSERT INTO users (phone_number, password, role_id, refer_user_id, status)
SELECT '0000000000', '$argon2id$v=19$m=19456,p=1,t=2$OcCU2koSdT12g7YsaSTn3A$563qwswULjqyrumgsRs6EQmfl2mkJdzK3dSRGUnN5qU', r.role_id, NULL, 'ACTIVE'
FROM roles r
WHERE r.role_name = 'HOST'
ON CONFLICT (phone_number) DO NOTHING;
