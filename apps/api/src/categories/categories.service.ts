// src/categories/categories.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager, Repository } from "typeorm";
import { CatalogStatus, type Role } from "@toolhackchain/shared";
import { effectiveStatus, likePattern, type Page } from "../common/catalog-list.js";
import { idsByOrdinal, normSql } from "../common/normalize.js";
import { CategoryEntity, LobbyEntity } from "../database/entities/index.js";
import type { CategoryListQueryDto } from "./dto/category-list-query.dto.js";

export type CategoryItem = {
  category_id: string; category_name: string; lobby_id: string; lobby_name: string; status: string; created_at: Date;
  stream_count: number;   // số stream của category (USER chỉ đếm ACTIVE)
};
type RawCategory = Omit<CategoryItem, "stream_count"> & { stream_count: string };

const CATEGORY_COLUMNS = [
  "c.categoryId AS category_id", "c.categoryName AS category_name",
  "c.lobbyId AS lobby_id", "l.lobbyName AS lobby_name",
  "c.status AS status", "c.createdAt AS created_at",
];
const STREAM_COUNT_SQL = `(SELECT COUNT(*) FROM streams s2 WHERE s2.category_id = c.categoryId AND (:onlyActive = false OR s2.status = :active))`;

export type CategoryInput = { lobbyId: string; name: string };

@Injectable()
export class CategoriesService {
  constructor(@InjectRepository(CategoryEntity) private repo: Repository<CategoryEntity>) {}

  /** Query gốc: USER chỉ thấy category ACTIVE có lobby cha ACTIVE. */
  private base(role: Role) {
    const qb = this.repo.createQueryBuilder("c").innerJoin(LobbyEntity, "l", "l.lobbyId = c.lobbyId");
    if (role === "USER") {
      qb.andWhere("c.status = :visible AND l.status = :visible", { visible: CatalogStatus.ACTIVE });
    }
    return qb;
  }

  private select(qb: ReturnType<CategoriesService["base"]>, role: Role) {
    return qb
      .select(CATEGORY_COLUMNS)
      .addSelect(STREAM_COUNT_SQL, "stream_count")
      .setParameters({ onlyActive: role === "USER", active: CatalogStatus.ACTIVE });
  }

  async getOne(role: Role, id: string): Promise<CategoryItem> {
    const row = await this.select(this.base(role).andWhere("c.categoryId = :id", { id }), role).getRawOne<RawCategory>();
    if (!row) throw new NotFoundException();
    return { ...row, stream_count: Number(row.stream_count) };
  }

  async list(role: Role, dto: CategoryListQueryDto): Promise<Page<CategoryItem>> {
    const qb = this.base(role);
    const status = effectiveStatus(role, dto.status);
    if (status) qb.andWhere("c.status = :status", { status });
    if (dto.lobby_id) qb.andWhere("c.lobbyId = :lobbyId", { lobbyId: dto.lobby_id });
    if (dto.q?.trim()) qb.andWhere("c.categoryName ILIKE :q", { q: likePattern(dto.q) });

    const total = await qb.getCount();
    const rows = await this.select(qb, role)
      .orderBy("l.lobbyName", "ASC").addOrderBy("c.categoryName", "ASC").addOrderBy("c.categoryId", "ASC")
      .offset((dto.page - 1) * dto.limit).limit(dto.limit)
      .getRawMany<RawCategory>();
    return { items: rows.map((r) => ({ ...r, stream_count: Number(r.stream_count) })), total, page: dto.page, limit: dto.limit };
  }

  /** Trả về category_id theo đúng thứ tự đầu vào. */
  async upsertMany(m: EntityManager, items: CategoryInput[]): Promise<string[]> {
    if (items.length === 0) return [];
    const lobbyIds = items.map((i) => i.lobbyId);
    const names = items.map((i) => i.name);
    await m.query(
      `INSERT INTO categories (lobby_id, category_name)
       SELECT * FROM unnest($1::uuid[], $2::text[])
       ON CONFLICT (lobby_id, (${normSql("category_name")})) DO NOTHING`,
      [lobbyIds, names],
    );
    const rows = await m.query(
      `SELECT i.ord::text AS ord, c.category_id::text AS id
       FROM unnest($1::uuid[], $2::text[]) WITH ORDINALITY AS i(lobby_id, name, ord)
       JOIN categories c ON c.lobby_id = i.lobby_id AND ${normSql("c.category_name")} = ${normSql("i.name")}`,
      [lobbyIds, names],
    );
    return idsByOrdinal(rows, items.length);
  }
}
