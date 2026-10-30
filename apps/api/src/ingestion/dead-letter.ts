// src/ingestion/dead-letter.ts
// Dead-letter stream cho tick gây lỗi dữ liệu khi ghi DB (SQLSTATE nhóm 22 / 23): tách riêng để các tick còn lại đi tiếp.
import type { Redis } from "ioredis";
import { TICK_DEAD_STREAM, type Tick } from "@toolhackchain/shared";
import { fieldsToObject, type StreamEntry } from "../common/stream.util.js";
import { DEAD_ERROR_MAX_LENGTH, DEAD_STREAM_MAXLEN } from "./ingestion.constants.js";

export type DeadTick = {
  deadId: string;          // id trong ticks:dead (dùng làm mốc cho lần đọc tiếp theo)
  sourceId: string;        // id gốc trong stream ticks
  itemId: string;
  errorCode: string;
  error: string;
  failedAt: string;        // ISO
  tick: Tick | null;       // null nếu JSON hỏng
};

/** Mã SQLSTATE của lỗi Postgres (TypeORM bọc lỗi pg trong QueryFailedError). */
export function pgErrorCode(e: unknown): string | undefined {
  const err = e as { code?: unknown; driverError?: { code?: unknown } } | null;
  const code = err?.code ?? err?.driverError?.code;
  return typeof code === "string" ? code : undefined;
}

/** Lỗi do dữ liệu của tick (retry vô ích): data exception (22xxx), integrity violation (23xxx) trừ FK (23503 đã có xử lý riêng). */
export function isDataError(e: unknown): boolean {
  const code = pgErrorCode(e);
  return code !== undefined && /^(22|23)/.test(code) && code !== "23503";
}

export async function deadLetterTick(redis: Redis, sourceId: string, tick: Tick, e: unknown): Promise<void> {
  const message = e instanceof Error ? e.message : String(e);
  await redis.xadd(
    TICK_DEAD_STREAM, "MAXLEN", "~", DEAD_STREAM_MAXLEN, "*",
    "source_id", sourceId,
    "item_id", String(tick.item_id ?? ""),
    "error_code", pgErrorCode(e) ?? "",
    "error", message.slice(0, DEAD_ERROR_MAX_LENGTH),
    "failed_at", new Date().toISOString(),
    "tick", JSON.stringify(tick),
  );
}

/**
 * Đọc các tick trong ticks:dead theo thứ tự cũ → mới, tối đa `count` tin.
 * `afterId`: deadId của tin cuối lần đọc trước (không gồm chính nó); bỏ trống = đọc từ đầu.
 * Chưa được nơi nào gọi; chỉ đọc, không xóa. Muốn bỏ tin đã xử lý thì XDEL riêng.
 */
export async function readDeadTicks(redis: Redis, count = 100, afterId?: string): Promise<DeadTick[]> {
  const entries = (await redis.xrange(
    TICK_DEAD_STREAM, afterId ? `(${afterId}` : "-", "+", "COUNT", count,
  )) as StreamEntry[];
  return entries.map(([deadId, fields]) => {
    const f = fieldsToObject(fields);
    let tick: Tick | null = null;
    try { tick = JSON.parse(f.tick) as Tick; } catch { /* giữ null */ }
    return {
      deadId, sourceId: f.source_id, itemId: f.item_id,
      errorCode: f.error_code, error: f.error, failedAt: f.failed_at, tick,
    };
  });
}
