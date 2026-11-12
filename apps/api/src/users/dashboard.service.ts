// src/users/dashboard.service.ts
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";

export type DashboardResponse = {
  total_users: number;
  active_users: number;
  inactive_7_days: number;
  total_unused_points: string;   // bigint dạng chuỗi, cộng trong SQL
  created_per_day: { date: string; value: number }[];       // 7 ngày gần nhất (gồm hôm nay), cũ → mới
  points_used_per_day: { date: string; value: string }[];   // CHARGE trừ REFUND, bigint dạng chuỗi
};

const MAX_DEPTH = 10;
const DAYS = 7;
const TZ = "Asia/Ho_Chi_Minh";   // ranh giới "ngày" của biểu đồ

// Mọi user dưới người gọi (con trực tiếp và con cháu), không gồm DELETED. $1 = actor, $2 = MAX_DEPTH.
const TREE = `
  WITH RECURSIVE tree AS (
    SELECT user_id, 1 AS depth, ARRAY[user_id] AS path FROM users WHERE refer_user_id = $1
    UNION ALL
    SELECT c.user_id, t.depth + 1, t.path || c.user_id
    FROM users c JOIN tree t ON c.refer_user_id = t.user_id
    WHERE t.depth < $2 AND NOT c.user_id = ANY(t.path)
  ),
  scope AS (
    SELECT u.user_id, u.status, u.balance, u.created_at, u.last_login_at
    FROM tree t JOIN users u ON u.user_id = t.user_id
    WHERE u.status <> 'DELETED'
  ),
  days AS (
    SELECT d::date AS day
    FROM generate_series((now() AT TIME ZONE '${TZ}')::date - ${DAYS - 1}, (now() AT TIME ZONE '${TZ}')::date, interval '1 day') d
  )`;

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /** Số liệu dashboard của cây user dưới người gọi (HOST: admin + user của họ; ADMIN: user). Phạm vi chỉ lấy từ token. */
  async get(actor: AuthUser): Promise<DashboardResponse> {
    const params = [actor.userId, MAX_DEPTH];
    const [totals, created, used] = await Promise.all([
      this.dataSource.query(
        `${TREE}
         SELECT count(*)::int AS total_users,
                (count(*) FILTER (WHERE status = 'ACTIVE'))::int AS active_users,
                (count(*) FILTER (WHERE status = 'ACTIVE' AND COALESCE(last_login_at, created_at) < now() - interval '7 days'))::int AS inactive_7_days,
                COALESCE(sum(balance), 0)::text AS total_unused_points
         FROM scope`,
        params,
      ),
      this.dataSource.query(
        `${TREE}
         SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(s.user_id)::int AS value
         FROM days d
         LEFT JOIN scope s ON (s.created_at AT TIME ZONE '${TZ}')::date = d.day
         GROUP BY d.day ORDER BY d.day`,
        params,
      ),
      this.dataSource.query(
        `${TREE}
         SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                COALESCE(sum(CASE t.transaction_type WHEN 'CHARGE' THEN t.amount ELSE -t.amount END), 0)::text AS value
         FROM days d
         LEFT JOIN (
           SELECT tx.amount, tx.transaction_type, (tx.created_at AT TIME ZONE '${TZ}')::date AS day
           FROM transactions tx JOIN scope s ON s.user_id = tx.user_id
           WHERE tx.transaction_type IN ('CHARGE', 'REFUND') AND tx.created_at >= now() - interval '${DAYS + 1} days'
         ) t ON t.day = d.day
         GROUP BY d.day ORDER BY d.day`,
        params,
      ),
    ]);
    return { ...totals[0], created_per_day: created, points_used_per_day: used };
  }
}
