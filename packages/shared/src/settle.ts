// Contract của stream settle:requests (api ghi, api đọc — group `settle`). Mỗi entry một field `payload` là JSON SettleRequest.
// Chỉ là tín hiệu "hãy hoàn tiền ván này": consumer tự đọc trạng thái ván trong DB, nên gửi trùng / thừa đều vô hại.
// Bên gửi CHỈ tạo message qua buildSettleMessage(), consumer CHỈ đọc qua parseSettleMessage() — không tự ghép field.
export const SETTLE_REQUEST_STREAM = "settle:requests";
export const SETTLE_STREAM_MAXLEN = 10_000;   // XADD MAXLEN ~
export const SETTLE_GROUP = "settle";
export const SETTLE_SCHEMA_VERSION = 1;
export const SETTLE_PAYLOAD_FIELD = "payload";
/** Message sai contract: consumer chép sang đây (kèm nội dung gốc) rồi mới XACK, để điều tra. */
export const SETTLE_DEAD_STREAM = "settle:dead";
export const SETTLE_DEAD_MAXLEN = 1_000;      // XADD MAXLEN ~

export const SETTLE_REASONS = ["FINISHED", "CANCELLED"] as const;
export type SettleReason = (typeof SETTLE_REASONS)[number];
/** Chỉ cần id ván + lý do; mọi thứ khác (stream, pick, result...) settlement tự đọc từ DB. */
export type SettleRequest = { schema_version: typeof SETTLE_SCHEMA_VERSION; game_session_id: string; reason: SettleReason };

export type SettleParseResult = { ok: true; value: SettleRequest } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Field phẳng cho XADD: [SETTLE_PAYLOAD_FIELD, json]. Không tự kiểm tra — bên gửi parse lại trước khi XADD. */
export function buildSettleMessage(gameSessionId: string, reason: SettleReason): string[] {
  const msg: SettleRequest = { schema_version: SETTLE_SCHEMA_VERSION, game_session_id: gameSessionId, reason };
  return [SETTLE_PAYLOAD_FIELD, JSON.stringify(msg)];
}

/** Đọc field phẳng của một entry ([k1, v1, k2, v2...] như ioredis trả về). */
export function parseSettleMessage(fields: string[]): SettleParseResult {
  if (!Array.isArray(fields) || fields.length % 2 !== 0) return { ok: false, error: "fields không phải mảng cặp key/value" };
  let raw: string | undefined;
  for (let i = 0; i < fields.length; i += 2) if (fields[i] === SETTLE_PAYLOAD_FIELD) raw = fields[i + 1];
  if (typeof raw !== "string") return { ok: false, error: `thiếu field ${SETTLE_PAYLOAD_FIELD}` };
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return { ok: false, error: "payload không phải JSON" }; }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "payload không phải object" };
  const o = v as Record<string, unknown>;
  if (o.schema_version !== SETTLE_SCHEMA_VERSION) return { ok: false, error: `schema_version phải là ${SETTLE_SCHEMA_VERSION}` };
  if (typeof o.game_session_id !== "string" || !UUID_RE.test(o.game_session_id)) return { ok: false, error: "game_session_id thiếu hoặc không phải UUID" };
  if (typeof o.reason !== "string" || !(SETTLE_REASONS as readonly string[]).includes(o.reason)) {
    return { ok: false, error: `reason phải là ${SETTLE_REASONS.join(" | ")}` };
  }
  return { ok: true, value: { schema_version: SETTLE_SCHEMA_VERSION, game_session_id: o.game_session_id, reason: o.reason as SettleReason } };
}
