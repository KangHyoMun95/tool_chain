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
  children: SubAdminItem[];   // con trực tiếp của user này (đệ quy)
};
type Flat = Omit<SubAdminItem, "children">;

const MAX_DEPTH = 10;

@Injectable()
export class SubAdminsService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Cây user dưới người gọi: `items` là con trực tiếp (depth 1), mỗi user có `children` là con trực tiếp của nó, đệ quy.
   * Không gồm chính người gọi. Phạm vi chỉ phụ thuộc actor.userId, không nhận id từ client.
   * Lọc (status / role / q): giữ user khớp và mọi tổ tiên của nó (để vẫn nằm đúng chỗ trong cây), `children` chỉ gồm nhánh có user khớp.
   * Phân trang (`total`, `page`, `limit`) tính trên con trực tiếp.
   */
  async list(actor: AuthUser, dto: SubAdminListQueryDto): Promise<Page<SubAdminItem>> {
    const flat: Flat[] = await this.dataSource.query(
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
              u.refer_user_id, t.depth::int AS depth, u.created_at
       FROM tree t
       JOIN users u ON u.user_id = t.user_id
       JOIN roles r ON r.role_id = u.role_id
       ORDER BY t.depth, u.created_at DESC, u.user_id`,
      [actor.userId, MAX_DEPTH],
    );

    const nodes = new Map<string, SubAdminItem>(flat.map((u) => [u.user_id, { ...u, children: [] }]));
    const roots: SubAdminItem[] = [];
    for (const n of nodes.values()) {
      const parent = n.depth > 1 ? nodes.get(n.refer_user_id) : undefined;
      (parent ? parent.children : roots).push(n);
    }

    const matches = (n: SubAdminItem) =>
      (!dto.status || n.status === dto.status) &&
      (!dto.role || n.role === dto.role) &&
      (!dto.q || n.phone_number.includes(dto.q));
    const prune = (list: SubAdminItem[]): SubAdminItem[] =>
      list.filter((n) => {
        n.children = prune(n.children);
        return matches(n) || n.children.length > 0;
      });
    const visible = dto.status || dto.role || dto.q ? prune(roots) : roots;

    const start = (dto.page - 1) * dto.limit;
    return { items: visible.slice(start, start + dto.limit), total: visible.length, page: dto.page, limit: dto.limit };
  }
}
