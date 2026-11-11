// src/common/with-timeout.ts
/** Ném lỗi nếu `work` chưa xong sau `ms` (work vẫn chạy tiếp; query treo do statement_timeout / query_timeout của pg cắt). */
export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: quá ${ms}ms`)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
