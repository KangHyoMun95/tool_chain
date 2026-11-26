// src/jobs/job-db.ts
// Truy cập DB tối giản cho các job dọn dữ liệu, dùng chung cho job tự động (trong API) và CLI run-job: một pg.Pool riêng
// (không qua TypeORM) nên không dính quirk [rows, rowCount] của UPDATE / DELETE ... RETURNING và không tranh pool của API.
import pg from "pg";

export interface JobDb {
  /** Câu trả về dòng (SELECT, hoặc INSERT / DELETE ... RETURNING). */
  rows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Câu ghi: số dòng bị ảnh hưởng. */
  exec(sql: string, params?: unknown[]): Promise<number>;
  /** Chạy fn trong MỘT transaction (BEGIN / COMMIT, lỗi thì ROLLBACK rồi ném lại). */
  transaction<T>(fn: (db: JobDb) => Promise<T>): Promise<T>;
}

type Queryable = Pick<pg.Pool, "query">;

function wrap(q: Queryable, tx?: (fn: (db: JobDb) => Promise<unknown>) => Promise<unknown>): JobDb {
  return {
    async rows<T>(sql: string, params?: unknown[]) { return (await q.query(sql, params as unknown[])).rows as T[]; },
    async exec(sql: string, params?: unknown[]) { return (await q.query(sql, params as unknown[])).rowCount ?? 0; },
    async transaction<T>(fn: (db: JobDb) => Promise<T>) {
      if (!tx) throw new Error("transaction lồng nhau không được hỗ trợ");
      return (await tx(fn as (db: JobDb) => Promise<unknown>)) as T;
    },
  };
}

export type JobPool = JobDb & { close(): Promise<void> };

export function createJobPool(url = process.env.DATABASE_URL): JobPool {
  if (!url) throw new Error("Thiếu DATABASE_URL");
  const pool = new pg.Pool({
    connectionString: url,
    max: 2,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" } : false,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 120_000,                       // lô 500 ván: dư sức, nhưng không để treo vô hạn
    idle_in_transaction_session_timeout: 120_000,
  });
  const base = wrap(pool, async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await fn(wrap(client));
      await client.query("COMMIT");
      return res;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  });
  return Object.assign(base, { close: () => pool.end() });
}
