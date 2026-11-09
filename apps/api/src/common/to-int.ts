// src/common/to-int.ts
export const MAX_INT4 = 2_147_483_647;

/** Số nguyên không âm, vừa int4; nhận number hoặc chuỗi số (đã trim). */
export function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_INT4 ? n : null;
}
