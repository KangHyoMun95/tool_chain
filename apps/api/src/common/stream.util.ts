// src/common/stream.util.ts
// ioredis trả field dạng mảng phẳng [k1, v1, k2, v2] → đổi thành object
export function fieldsToObject(fields: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) o[fields[i]] = fields[i + 1];
  return o;
}
export type StreamEntry = [id: string, fields: string[]];
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));