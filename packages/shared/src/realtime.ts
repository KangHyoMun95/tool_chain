// packages/shared/src/realtime.ts
export const TICK_STREAM = "ticks";
export const PERSIST_GROUP = "persist";
export const TICK_DEAD_STREAM = "ticks:dead";   // tick gây lỗi dữ liệu khi ghi DB (đọc lại: ingestion/dead-letter.ts)

// Payload crawler gửi liên tục (nhiều lần cho cùng một ván). Phải khớp CrawlPayload trong apps/crawl-agent/contract.py.
// Ghi DB: lobby_name, category_name, stream_name, stream_shoe, stream_round, streamer_id, actual_result.
// Chỉ hiển thị (chỉ đi qua realtime/SSE, KHÔNG ghi DB): player_count, player_value, status, total_B/P/T, streamer_country, các trường *_time.
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
  streamer_country?: string | null;  // quốc gia của người live (chỉ hiển thị, KHÔNG ghi DB)
  // Chuỗi thời gian từ nguồn (chỉ realtime, KHÔNG ghi DB); null/thiếu khi nguồn không gửi.
  deliver_time?: string | null;
  timestamp?: string | null;
  stamp_time?: string | null;
  round_start_time?: string | null;
  repaint_time?: string | null;
};

// Trạng thái phiên (CrawlPayload.status). Giá trị khác coi là lạ: hiển thị trung tính.
export type StreamStatus = "IN_PROGRESS" | "DONE" | "GET_RESULT" | "SUMMARY_RESULT";
export const STREAM_STATUSES: readonly StreamStatus[] = ["IN_PROGRESS", "DONE", "GET_RESULT", "SUMMARY_RESULT"];

export type Tick<T = CrawlPayload> = {
  id: string;                        // khoá dedup (sha1)
  item_id: string;                   // key_id: <lobby>|<category>|<stream> đã chuẩn hoá (khoá phòng realtime)
  ts: number;                        // epoch giây, lấy từ nguồn
  data: T;
};

// Event SSE xuống portal: tick gốc + stream_id của DB (streams.stream_id), null khi chưa có trong cache id.
export type RealtimeTick<T = CrawlPayload> = Tick<T> & { stream_id: string | null };

// Chuẩn hóa tên CHỈ để chống trùng, không lưu DB. Phải khớp normalize_name() ở contract.py và biểu thức unique index.
export const normalizeName = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/** key_id = <lobby>|<category>|<stream> đã chuẩn hóa. Chỉ dùng làm khóa cache / phòng realtime. */
export const buildKeyId = (lobby: string, category: string, stream: string): string =>
  [lobby, category, stream].map(normalizeName).join("|");

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