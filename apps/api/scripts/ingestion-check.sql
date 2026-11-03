-- Đếm dòng các bảng ingestion
SELECT 'lobbies' AS tbl, count(*) FROM lobbies
UNION ALL SELECT 'categories', count(*) FROM categories
UNION ALL SELECT 'streams', count(*) FROM streams
UNION ALL SELECT 'stream_information', count(*) FROM stream_information
UNION ALL SELECT 'game_sessions', count(*) FROM game_sessions;

SELECT lobby_id, lobby_name FROM lobbies ORDER BY lobby_id;
SELECT stream_id, stream_name, category_id FROM streams ORDER BY stream_id;
SELECT stream_id, streamer_id FROM stream_information ORDER BY stream_id;
SELECT game_session_id, stream_id, road_shoe, road_count, result, status FROM game_sessions ORDER BY stream_id, road_shoe, road_count;

-- Chạy TRƯỚC khi áp V5 trên DB có dữ liệu: mọi câu phải trả 0 dòng, nếu không V5 sẽ lỗi.
-- SELECT lower(btrim(regexp_replace(lobby_name, '\s+', ' ', 'g'))) n, count(*) FROM lobbies GROUP BY 1 HAVING count(*) > 1;
-- SELECT lobby_id, lower(btrim(regexp_replace(category_name, '\s+', ' ', 'g'))) n, count(*) FROM categories GROUP BY 1, 2 HAVING count(*) > 1;
-- SELECT category_id, lower(btrim(regexp_replace(stream_name, '\s+', ' ', 'g'))) n, count(*) FROM streams GROUP BY 1, 2 HAVING count(*) > 1;
-- SELECT stream_id, count(*) FROM stream_information GROUP BY 1 HAVING count(*) > 1;
-- V6: bảng game_sessions phải rỗng trước khi migrate
-- SELECT count(*) FROM game_sessions;

-- Các trường time (deliver_time, timestamp, stamp_time, round_start_time, repaint_time) và total_B/P/T chỉ realtime, KHÔNG được có trong DB:
-- phải trả 0 dòng.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name ~ '(deliver|stamp|repaint|round_start)_time$' OR column_name IN ('timestamp', 'total_b', 'total_p', 'total_t'));
