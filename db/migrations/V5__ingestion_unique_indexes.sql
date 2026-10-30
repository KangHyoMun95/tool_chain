-- Ingestion từ crawler: chống trùng bằng unique index trên BIỂU THỨC tên (không thêm cột *_norm).
-- Biểu thức phải khớp normalizeName() ở apps/api/src/common/normalize.ts:
--   gộp khoảng trắng liên tiếp thành 1, trim, lowercase.
-- Nếu dữ liệu hiện có đang trùng theo biểu thức này thì migration sẽ lỗi và rollback (Flyway chạy trong transaction).
--
-- streams.key_id bị bỏ: key_id chỉ là khoá cache trong code, không lưu DB.
-- stream_round của crawler (số nguyên) lưu ở game_sessions.road_count.

ALTER TABLE streams DROP COLUMN key_id;

CREATE UNIQUE INDEX uq_lobbies_name_norm
    ON lobbies ((lower(btrim(regexp_replace(lobby_name, '\s+', ' ', 'g')))));

ALTER TABLE categories DROP CONSTRAINT categories_lobby_id_category_name_key;
CREATE UNIQUE INDEX uq_categories_lobby_name_norm
    ON categories (lobby_id, (lower(btrim(regexp_replace(category_name, '\s+', ' ', 'g')))));

CREATE UNIQUE INDEX uq_streams_category_name_norm
    ON streams (category_id, (lower(btrim(regexp_replace(stream_name, '\s+', ' ', 'g')))));

-- Một dòng stream_information cho mỗi stream.
DROP INDEX idx_stream_information_stream_id;
CREATE UNIQUE INDEX uq_stream_information_stream_id ON stream_information (stream_id);

-- Một (stream, stream_round) = một game_session. NULL road_count không bị ràng buộc.
CREATE UNIQUE INDEX uq_game_sessions_stream_road ON game_sessions (stream_id, road_count);
