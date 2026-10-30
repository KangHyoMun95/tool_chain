// packages/shared/src/realtime.ts
export const TICK_STREAM = "ticks";
export const PERSIST_GROUP = "persist";
export const TICK_DEAD_STREAM = "ticks:dead";   // tick gây lỗi dữ liệu khi ghi DB (đọc lại: ingestion/dead-letter.ts)

// Payload crawler gửi liên tục (nhiều lần cho cùng một ván). Phải khớp CrawlPayload trong apps/crawl-agent/contract.py.
// Ghi DB: lobby_name, category_name, stream_name, stream_shoe, stream_round, streamer_id, actual_result.
// Chỉ hiển thị (chỉ đi qua realtime/SSE, KHÔNG ghi DB): player_count, player_value, status, total_B/P/T.
// stream_id là id text phía nguồn (không phải streams.stream_id) → ingestion bỏ qua.
export type CrawlPayload = {
  lobby_name: string;
  category_name: string;
  stream_id: string;
  stream_name: string;
  stream_shoe: number | string;      // số nguyên (shoe hiện tại); round có thể reset khi đổi shoe
  stream_round: number | string;     // số nguyên (= game_sessions.road_count); (stream, stream_shoe, stream_round) = một game_session
  streamer_id: string;               // tên người live
  player_count: number;
  player_value: number;
  status: string;
  actual_result: string | null;      // null khi ván chưa có kết quả
  total_B: number;
  total_P: number;
  total_T: number;
};

export type Tick<T = CrawlPayload> = {
  id: string;                        // khoá dedup (sha1)
  item_id: string;                   // key_id: <lobby>|<category>|<stream> đã chuẩn hoá (khoá phòng realtime)
  ts: number;                        // epoch giây, lấy từ nguồn
  data: T;
};

export const RedisKeys = {
  // cache id danh mục (ingestion); norm = tên đã chuẩn hoá, keyId = <lobby>|<category>|<stream> đã chuẩn hoá
  lobby: (norm: string) => `lobby:${norm}`,
  category: (lobbyId: string, norm: string) => `category:${lobbyId}:${norm}`,
  stream: (keyId: string) => `stream:${keyId}`,
  // trạng thái quan sát shoe/round của mỗi stream (chỉ để log, ingestion/shoe-observer.ts)
  streamLast: (keyId: string) => `stream_last:${keyId}`,
  streamShoes: (keyId: string) => `stream_shoes:${keyId}`,
  latest: (itemId: string) => `latest:${itemId}`,
  perm: (userId: string) => `perm:user:${userId}`,
  session: (sid: string) => `session:${sid}`,
  userSessions: (userId: string) => `user_sessions:${userId}`,
  refresh: (sid: string) => `refresh:${sid}`,
  loginFail: (phone: string) => `login_fail:${phone}`,
  loginLock: (phone: string) => `login_lock:${phone}`,
} as const;