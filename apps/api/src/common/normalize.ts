// src/common/normalize.ts
// Chuẩn hóa tên CHỈ để chống trùng, không lưu DB (DB lưu tên đã trim).
// Phải khớp biểu thức unique index ở db/migrations/V5__ingestion_unique_indexes.sql.

export const normalizeName = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Tên hiển thị lưu DB: bản trim của lần gặp đầu tiên. */
export const displayName = (s: string): string => s.trim();

/** key_id = <lobby>|<category>|<stream> đã chuẩn hóa. Chỉ dùng làm khóa cache / phòng realtime. */
export const buildKeyId = (lobby: string, category: string, stream: string): string =>
  [lobby, category, stream].map(normalizeName).join("|");

/** Biểu thức SQL tương đương normalizeName() cho một cột/biểu thức text. */
export const normSql = (col: string): string =>
  `lower(btrim(regexp_replace(${col}, '\\s+', ' ', 'g')))`;

/** Kết quả `... WITH ORDINALITY` → mảng id theo đúng thứ tự đầu vào. */
export function idsByOrdinal(rows: { ord: string; id: string }[], size: number): string[] {
  const out = Array.from<string>({ length: size });
  for (const r of rows) out[Number(r.ord) - 1] = String(r.id);
  return out;
}
