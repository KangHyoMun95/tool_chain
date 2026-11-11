// src/lib/stream-debug.ts
// NEXT_PUBLIC_SHOW_STREAM_DEBUG=true (đọc lúc build): khung debug time ở trang chi tiết + console.debug của luồng realtime
// (tick bị bỏ vì vị trí cũ, round_result, prediction, đổi phiên).
export const SHOW_STREAM_DEBUG = process.env.NEXT_PUBLIC_SHOW_STREAM_DEBUG === "true";

export function streamDebug(message: string, detail?: unknown): void {
  if (!SHOW_STREAM_DEBUG) return;
  if (detail === undefined) console.debug(`[stream] ${message}`);
  else console.debug(`[stream] ${message}`, detail);
}
