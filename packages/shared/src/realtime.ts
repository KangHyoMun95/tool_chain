// packages/shared/src/realtime.ts
import type { PredictionEvent } from "./ai";

export const TICK_STREAM = "ticks";
export const PERSIST_GROUP = "persist";
export const TICK_DEAD_STREAM = "ticks:dead";   // tick gây lỗi dữ liệu khi ghi DB (đọc lại: ingestion/dead-letter.ts)

// Payload crawler gửi liên tục (nhiều lần cho cùng một ván). Phải khớp CrawlPayload trong apps/crawl-agent/contract.py.
// Ghi DB: lobby_name, category_name, stream_name, stream_shoe, stream_round, streamer_id, actual_result.
// Chỉ hiển thị (chỉ đi qua realtime/SSE, KHÔNG ghi DB): player_count, player_value, status, total_B/P/T, streamer_name, streamer_country, các trường *_time.
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
  streamer_name?: string | null;     // tên người live (chỉ hiển thị, KHÔNG ghi DB)
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
// Hub chỉ đẩy tick có vị trí >= phiên đang giữ (tick muộn của ván trước bị bỏ, kể cả status / total / time).
// `type` phân loại event; client coi event thiếu `type` là "tick" (tương thích bản cũ).
export type RealtimeTick<T = CrawlPayload> = Tick<T> & { type: "tick"; stream_id: string | null };

// Event SSE kết quả một ván (hub phát MỘT lần, chỉ khi ván này MỚI HƠN kết quả gần nhất đã phát của stream — xem comparePosition).
// Portal lấy kết quả / lịch sử / đúng-sai CHỈ từ event này (không tự dò actual_result trong tick).
export type RealtimeRoundResult = {
  type: "round_result"; item_id: string; stream_id: string | null; shoe: number; round: number; result: string; ts: number;
};

// ---- Vị trí ván: phiên và kết quả CHỈ ĐI TỚI (hub, ShoeObserver, portal dùng chung) ----
/** Vị trí của một ván trong stream. Round chỉ reset khi đổi shoe. */
export type Position = { shoe: number; round: number };
/** Shoe hiện tại và shoe liền trước của một stream (null = chưa biết). */
export type ShoeContext = { current: number | null; previous: number | null };

// Khác shoe: chưa thấy = 3 (shoe mới, KHÔNG giả định số shoe tăng dần), current = 2, previous = 1, shoe cũ khác = 0.
function shoeRank(shoe: number, ctx: ShoeContext): number {
  if (shoe === ctx.current) return 2;
  if (shoe === ctx.previous) return 1;
  return 3;
}

/**
 * So `incoming` (tick vừa đến) với `ref` (con trỏ đang giữ): -1 cũ hơn, 0 bằng, 1 mới hơn.
 * Cùng shoe ⇒ chỉ so round (không có quy tắc "reset" trong cùng shoe: round chỉ reset khi đổi shoe).
 * Khác shoe ⇒ so hạng shoe theo `ctx`; shoe của `ref` không phải current / previous (cũ hơn nữa) có hạng 0.
 */
export function comparePosition(incoming: Position, ref: Position, ctx: ShoeContext): -1 | 0 | 1 {
  if (incoming.shoe === ref.shoe) return incoming.round === ref.round ? 0 : incoming.round > ref.round ? 1 : -1;
  const a = shoeRank(incoming.shoe, ctx);
  const b = ref.shoe === ctx.current ? 2 : ref.shoe === ctx.previous ? 1 : 0;
  return a === b ? 0 : a > b ? 1 : -1;
}

/** Gọi khi chấp nhận một vị trí: shoe mới ⇒ shoe hiện tại thành "shoe liền trước". Trả context mới (không sửa tại chỗ). */
export function advanceShoe(ctx: ShoeContext, shoe: number): ShoeContext {
  return shoe === ctx.current ? ctx : { current: shoe, previous: ctx.current };
}

/** Đọc (shoe, round) của payload crawler; null nếu thiếu / không phải số nguyên >= 0 (vd tick demo không có shoe/round). */
export function payloadPosition(d: unknown): Position | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const int = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  };
  const shoe = int(o.stream_shoe);
  const round = int(o.stream_round);
  return shoe === null || round === null ? null : { shoe, round };
}

// Event SSE dự đoán — KHÔNG đi kênh public: chỉ gửi trên kết nối tham gia (participate) của user đã bị trừ tiền cho ván đó;
// pick = null (AI không dự đoán, không ai bị trừ) thì gửi cho mọi kết nối tham gia của stream.
// item_id = key_id, ts = epoch giây của created_at (để client dùng chung logic chống tick cũ).
export type RealtimePrediction = { type: "prediction"; item_id: string; ts: number; stream_id: string; data: PredictionEvent };

// Gửi trên kết nối tham gia khi không trừ được tiền vì số dư < phí; server đóng kết nối ngay sau event này.
// Portal: báo hết điểm, quay về danh sách (không tự kết nối lại).
export type RealtimeInsufficientBalance = { type: "insufficient_balance"; stream_id: string; ts: number };

// SSE: GET /api/stream?ticket=<ticket> (ticket một lần từ POST /api/realtime/ticket, TTL 30s).
export const SSE_TICKET_TTL_SECONDS = 30;
export const SSE_PING_INTERVAL_MS = 15_000;   // server gửi "event: ping" mỗi khoảng này

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
  // Luồng dự đoán — API sở hữu (ghi): round_status, predictReq, recent. AI sở hữu (ghi): aiCounts, aiCounted. Giá trị: xem ai.ts.
  roundStatus: (gameSessionId: string) => `round_status:${gameSessionId}`,                       // status mới nhất của ván, TTL 1h
  predictReq: (gameSessionId: string) => `predict_req:${gameSessionId}`,                         // cờ đã phát yêu cầu, TTL 1h
  recent: (streamId: string, shoe: number) => `recent:${streamId}:${shoe}`,                      // HASH round → result, TTL 24h
  aiCounts: (streamId: string) => `ai:counts:${streamId}`,                                       // HASH "<pattern>|<B/P>" → số lần
  aiCounted: (streamId: string, shoe: number) => `ai:counted:${streamId}:${shoe}`,               // SET game_session_id đã đếm, TTL 48h
  // Billing — API sở hữu: cờ chống sweeper gửi lại settle:requests cho cùng một ván quá dày (SET NX EX)
  settleReq: (gameSessionId: string) => `settle_req:${gameSessionId}`,
  // SSE — API sở hữu: ticket một lần (JSON {user_id, session_id, items, participate}), TTL SSE_TICKET_TTL_SECONDS, đọc bằng GETDEL
  sseTicket: (ticket: string) => `sse_ticket:${ticket}`,
} as const;