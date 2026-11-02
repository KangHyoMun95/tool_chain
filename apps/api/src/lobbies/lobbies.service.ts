// src/lobbies/lobbies.service.ts
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager, Repository } from "typeorm";
import type { Role } from "@toolhackchain/shared";
import { effectiveStatus, likePattern, type CatalogListQueryDto, type Page } from "../common/catalog-list.js";
import { idsByOrdinal, normSql } from "../common/normalize.js";
import { LobbyEntity } from "../database/entities/index.js";

export type LobbyItem = { lobby_id: string; lobby_name: string; status: string; created_at: Date };

@Injectable()
export class LobbiesService {
  constructor(@InjectRepository(LobbyEntity) private repo: Repository<LobbyEntity>) {}

  async list(role: Role, dto: CatalogListQueryDto): Promise<Page<LobbyItem>> {
    const qb = this.repo.createQueryBuilder("l");
    const status = effectiveStatus(role, dto.status);
    if (status) qb.andWhere("l.status = :status", { status });
    if (dto.q?.trim()) qb.andWhere("l.lobbyName ILIKE :q", { q: likePattern(dto.q) });

    const total = await qb.getCount();
    const rows = await qb
      .select(["l.lobbyId AS lobby_id", "l.lobbyName AS lobby_name", "l.status AS status", "l.createdAt AS created_at"])
      .orderBy("l.lobbyName", "ASC").addOrderBy("l.lobbyId", "ASC")
      .offset((dto.page - 1) * dto.limit).limit(dto.limit)
      .getRawMany<LobbyItem>();
    return { items: rows, total, page: dto.page, limit: dto.limit };
  }

  /** names: tên hiển thị đã trim, đã khử trùng theo normalizeName. Trả về lobby_id theo đúng thứ tự đầu vào. */
  async upsertMany(m: EntityManager, names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    await m.query(
      `INSERT INTO lobbies (lobby_name) SELECT n FROM unnest($1::text[]) AS n
       ON CONFLICT ((${normSql("lobby_name")})) DO NOTHING`,
      [names],
    );
    const rows = await m.query(
      `SELECT i.ord::text AS ord, l.lobby_id::text AS id
       FROM unnest($1::text[]) WITH ORDINALITY AS i(name, ord)
       JOIN lobbies l ON ${normSql("l.lobby_name")} = ${normSql("i.name")}`,
      [names],
    );
    return idsByOrdinal(rows, names.length);
  }
}
