// src/users/sub-admins.service.ts
import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import type { Page } from "../common/catalog-list.js";
import type { SubAdminListQueryDto } from "./dto/sub-admin-list-query.dto.js";

export type SubAdminItem = {
  user_id: string; phone_number: string; display_name: string | null; role: string; status: string;
  balance: string;   // bigint dạng chuỗi, không tính toán ở TS
  refer_user_id: string; depth: number; created_at: Date;
  children: SubAdminItem[];   // con trực tiếp của user này (đệ quy)
};
export type SubAdminNode = Omit<SubAdminItem, "children">;
export type PointTransactionItem = {
  transaction_id: string; type: string; amount: string;
  granter_id: string | null; granter_name: string | null; reason: string | null; created_at: Date;   // không trả số điện thoại của người cấp
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
       SELECT u.user_id, u.phone_number, u.display_name, r.role_name AS role, u.status, u.balance::text AS balance,
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

    const q = dto.q?.toLowerCase();
    const matches = (n: SubAdminItem) =>
      (!dto.status || n.status === dto.status) &&
      (!dto.role || n.role === dto.role) &&
      (!q || n.phone_number.includes(q) || (n.display_name?.toLowerCase().includes(q) ?? false));
    const prune = (list: SubAdminItem[]): SubAdminItem[] =>
      list.filter((n) => {
        n.children = prune(n.children);
        return matches(n) || n.children.length > 0;
      });
    const visible = dto.status || dto.role || dto.q ? prune(roots) : roots;

    const start = (dto.page - 1) * dto.limit;
    return { items: visible.slice(start, start + dto.limit), total: visible.length, page: dto.page, limit: dto.limit };
  }

  /**
   * Thông tin một user nằm trong cây dưới người gọi (con trực tiếp hoặc con cháu, tối đa MAX_DEPTH cấp).
   * Ngoài phạm vi hoặc không tồn tại ⇒ 403 (cùng thông báo, không lộ user có tồn tại hay không).
   */
  async detail(actor: AuthUser, targetId: string): Promise<SubAdminNode> {
    const rows: (SubAdminNode & { found: boolean })[] = await this.dataSource.query(
      `-- top-level: SELECT
       WITH RECURSIVE up AS (
         SELECT user_id, refer_user_id, 1 AS hops FROM users WHERE user_id = $1
         UNION ALL
         SELECT u.user_id, u.refer_user_id, up.hops + 1
         FROM users u JOIN up ON u.user_id = up.refer_user_id
         WHERE up.hops < $3
       )
       SELECT u.user_id, u.phone_number, u.display_name, r.role_name AS role, u.status, u.balance::text AS balance,
              u.refer_user_id, up.hops::int AS depth, u.created_at
       FROM up
       JOIN users u ON u.user_id = $1
       JOIN roles r ON r.role_id = u.role_id
       WHERE up.refer_user_id = $2
       LIMIT 1`,
      [targetId, actor.userId, MAX_DEPTH],
    );
    if (rows.length === 0) throw new ForbiddenException("Không có quyền xem user này");
    return rows[0];
  }

  /** Con trực tiếp của một user trong cây của người gọi, mới nhất trước, có phân trang. */
  async usersOf(actor: AuthUser, targetId: string, page: number, limit: number): Promise<Page<SubAdminNode>> {
    await this.detail(actor, targetId);
    const [items, count] = await Promise.all([
      this.dataSource.query(
        `-- top-level: SELECT
         SELECT u.user_id, u.phone_number, u.display_name, r.role_name AS role, u.status, u.balance::text AS balance,
                u.refer_user_id, 1 AS depth, u.created_at
         FROM users u JOIN roles r ON r.role_id = u.role_id
         WHERE u.refer_user_id = $1
         ORDER BY u.created_at DESC, u.user_id
         LIMIT $2 OFFSET $3`,
        [targetId, limit, (page - 1) * limit],
      ),
      this.dataSource.query(`SELECT count(*)::int AS n FROM users WHERE refer_user_id = $1`, [targetId]),
    ]);
    return { items, total: count[0].n, page, limit };
  }

  /** Lịch sử điểm user nhận được (MINT / TRANSFER_IN) kèm người cấp, mới nhất trước. Dùng index (user_id, created_at DESC). */
  async pointTransactions(actor: AuthUser, targetId: string, page: number, limit: number): Promise<Page<PointTransactionItem>> {
    await this.detail(actor, targetId);
    const [items, count] = await Promise.all([
      this.dataSource.query(
        `-- top-level: SELECT
         SELECT t.transaction_id::text AS transaction_id, t.transaction_type AS type, t.amount::text AS amount,
                t.created_by AS granter_id, g.display_name AS granter_name, t.reason, t.created_at
         FROM transactions t LEFT JOIN users g ON g.user_id = t.created_by
         WHERE t.user_id = $1 AND t.transaction_type IN ('MINT', 'TRANSFER_IN')
         ORDER BY t.created_at DESC, t.transaction_id DESC
         LIMIT $2 OFFSET $3`,
        [targetId, limit, (page - 1) * limit],
      ),
      this.dataSource.query(
        `SELECT count(*)::int AS n FROM transactions WHERE user_id = $1 AND transaction_type IN ('MINT', 'TRANSFER_IN')`,
        [targetId],
      ),
    ]);
    return { items, total: count[0].n, page, limit };
  }
}
