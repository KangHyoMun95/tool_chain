// src/users/sub-admins.service.ts
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import type { Page } from "../common/catalog-list.js";
import type { SubAdminListQueryDto } from "./dto/sub-admin-list-query.dto.js";

export type SubAdminItem = {
  user_id: string; phone_number: string; role: string; status: string;
  balance: string;   // bigint dạng chuỗi, không tính toán ở TS
  refer_user_id: string; depth: number; created_at: Date;
};
type Raw = Omit<SubAdminItem, "depth"> & { depth: number; total: string };

const MAX_DEPTH = 10;

@Injectable()
export class SubAdminsService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Mọi user dưới người gọi: con trực tiếp (refer_user_id = người gọi, depth 1) và toàn bộ con cháu của họ.
   * Không gồm chính người gọi. Phạm vi chỉ phụ thuộc actor.userId, không nhận id từ client.
   */
  async list(actor: AuthUser, dto: SubAdminListQueryDto): Promise<Page<SubAdminItem>> {
    const params: unknown[] = [actor.userId, MAX_DEPTH];
    const where: string[] = [];
    if (dto.status) { params.push(dto.status); where.push(`u.status = $${params.length}`); }
    if (dto.role) { params.push(dto.role); where.push(`r.role_name = $${params.length}`); }
    if (dto.q) { params.push(`%${dto.q}%`); where.push(`u.phone_number LIKE $${params.length}`); }
    params.push(dto.limit, (dto.page - 1) * dto.limit);

    const rows: Raw[] = await this.dataSource.query(
      `-- top-level: SELECT
       WITH RECURSIVE tree AS (
         SELECT user_id, 1 AS depth, ARRAY[user_id] AS path
         FROM users WHERE refer_user_id = $1
         UNION ALL
         SELECT c.user_id, t.depth + 1, t.path || c.user_id
         FROM users c JOIN tree t ON c.refer_user_id = t.user_id
         WHERE t.depth < $2 AND NOT c.user_id = ANY(t.path)
       )
       SELECT u.user_id, u.phone_number, r.role_name AS role, u.status, u.balance::text AS balance,
              u.refer_user_id, t.depth::int AS depth, u.created_at,
              COUNT(*) OVER () AS total
       FROM tree t
       JOIN users u ON u.user_id = t.user_id
       JOIN roles r ON r.role_id = u.role_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY t.depth, u.created_at DESC, u.user_id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const total = rows.length ? Number(rows[0].total) : 0;
    return { items: rows.map(({ total: _t, ...item }) => item), total, page: dto.page, limit: dto.limit };
  }
}
