// src/categories/categories.service.ts
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager, Repository } from "typeorm";
import { CatalogStatus, type Role } from "@toolhackchain/shared";
import { effectiveStatus, likePattern, type Page } from "../common/catalog-list.js";
import { idsByOrdinal, normSql } from "../common/normalize.js";
import { CategoryEntity, LobbyEntity } from "../database/entities/index.js";
import type { CategoryListQueryDto } from "./dto/category-list-query.dto.js";

export type CategoryItem = {
  category_id: string; category_name: string; lobby_id: string; lobby_name: string; status: string; created_at: Date;
};

export type CategoryInput = { lobbyId: string; name: string };

@Injectable()
export class CategoriesService {
  constructor(@InjectRepository(CategoryEntity) private repo: Repository<CategoryEntity>) {}

  async list(role: Role, dto: CategoryListQueryDto): Promise<Page<CategoryItem>> {
    const qb = this.repo.createQueryBuilder("c")
      .innerJoin(LobbyEntity, "l", "l.lobbyId = c.lobbyId");
    const status = effectiveStatus(role, dto.status);
    if (status) qb.andWhere("c.status = :status", { status });
    if (role === "USER") qb.andWhere("l.status = :parent", { parent: CatalogStatus.ACTIVE });   // lobby cha phải ACTIVE
    if (dto.lobby_id) qb.andWhere("c.lobbyId = :lobbyId", { lobbyId: dto.lobby_id });
    if (dto.q?.trim()) qb.andWhere("c.categoryName ILIKE :q", { q: likePattern(dto.q) });

    const total = await qb.getCount();
    const rows = await qb
      .select([
        "c.categoryId AS category_id", "c.categoryName AS category_name",
        "c.lobbyId AS lobby_id", "l.lobbyName AS lobby_name",
        "c.status AS status", "c.createdAt AS created_at",
      ])
      .orderBy("l.lobbyName", "ASC").addOrderBy("c.categoryName", "ASC").addOrderBy("c.categoryId", "ASC")
      .offset((dto.page - 1) * dto.limit).limit(dto.limit)
      .getRawMany<CategoryItem>();
    return { items: rows, total, page: dto.page, limit: dto.limit };
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
