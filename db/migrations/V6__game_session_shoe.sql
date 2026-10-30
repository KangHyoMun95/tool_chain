-- Một ván được xác định bởi (stream_id, road_shoe, road_count): round có thể reset về đầu khi đổi shoe,
-- nên (stream_id, road_count) không còn duy nhất (xem V5).
--
-- Bảng game_sessions phải RỖNG: game_session_id đổi công thức sinh (thêm shoe) và dòng cũ không có shoe thật.
-- Nếu có dữ liệu thì migration lỗi và rollback (DDL của Postgres chạy trong transaction); xử lý dữ liệu rồi chạy lại.

ALTER TABLE game_sessions ADD COLUMN road_shoe INTEGER;

DO $$
DECLARE n BIGINT;
BEGIN
    SELECT count(*) INTO n FROM game_sessions;
    IF n > 0 THEN
        RAISE EXCEPTION 'game_sessions đang có % dòng, cần xử lý trước khi đặt road_shoe NOT NULL', n;
    END IF;
END $$;

ALTER TABLE game_sessions ALTER COLUMN road_shoe SET NOT NULL;

DROP INDEX uq_game_sessions_stream_road;
CREATE UNIQUE INDEX uq_game_sessions_stream_road_shoe ON game_sessions (stream_id, road_shoe, road_count);
