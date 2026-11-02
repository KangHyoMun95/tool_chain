// src/lobbies/lobbies.service.ts
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager, Repository } from "typeorm";
import { CatalogStatus, type Role } from "@toolhackchain/shared";
import { effectiveStatus, likePattern, type CatalogListQueryDto, type Page } from "../common/catalog-list.js";
import { idsByOrdinal, normSql } from "../common/normalize.js";
import { LobbyEntity } from "../database/entities/index.js";

export type LobbyItem = {
  lobby_id: string; lobby_name: string; status: string; created_at: Date;
  category_count: number;   // số category của sảnh (USER chỉ đếm ACTIVE)
  stream_count: number;     // số stream của sảnh (USER chỉ đếm stream ACTIVE thuộc category ACTIVE)
};

type RawLobby = Omit<LobbyItem, "category_count" | "stream_count"> & { category_count: string; stream_count: string };

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
      .addSelect(
        `(SELECT COUNT(*) FROM categories c2 WHERE c2.lobby_id = l.lobbyId AND (:onlyActive = false OR c2.status = :active))`,
        "category_count",
      )
      .addSelect(
        `(SELECT COUNT(*) FROM streams s2 JOIN categories c3 ON c3.category_id = s2.category_id
          WHERE c3.lobby_id = l.lobbyId AND (:onlyActive = false OR (s2.status = :active AND c3.status = :active)))`,
        "stream_count",
      )
      .setParameters({ onlyActive: role === "USER", active: CatalogStatus.ACTIVE })
      .orderBy("l.lobbyName", "ASC").addOrderBy("l.lobbyId", "ASC")
      .offset((dto.page - 1) * dto.limit).limit(dto.limit)
      .getRawMany<RawLobby>();
    return { items: rows.map((r) => ({ ...r, category_count: Number(r.category_count), stream_count: Number(r.stream_count) })), total, page: dto.page, limit: dto.limit };
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
