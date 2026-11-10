// src/common/update-returning.ts
// TypeORM (PostgresQueryRunner) trả kết quả của câu có lệnh chính là UPDATE / DELETE dạng [rows, rowCount], KHÔNG phải rows
// (INSERT / SELECT thì trả rows). Đọc `.map()` / `.length` trực tiếp trên đó ra giá trị sai (undefined, luôn 2) mà không báo lỗi.
// Mọi UPDATE / DELETE ... RETURNING (kể cả `WITH ... UPDATE ... RETURNING`) BẮT BUỘC đi qua hàm này (xem CLAUDE.md).

type Queryable = { query(sql: string, params?: unknown[]): Promise<unknown> };   // DataSource, EntityManager, QueryRunner

export async function updateReturning<T>(q: Queryable, sql: string, params?: unknown[]): Promise<T[]> {
  const res = await q.query(sql, params);
  if (!Array.isArray(res) || res.length !== 2 || !Array.isArray(res[0]) || typeof res[1] !== "number") {
    // Không đoán: sai dạng (vd câu chính thực ra là INSERT / SELECT) thì ném lỗi để transaction rollback.
    throw new Error("updateReturning: kết quả không có dạng [rows, rowCount] — câu lệnh chính phải là UPDATE / DELETE ... RETURNING");
  }
  return res[0] as T[];
}
