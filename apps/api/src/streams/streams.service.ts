// src/streams/streams.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager, Repository } from "typeorm";
import { CatalogStatus, type Role } from "@toolhackchain/shared";
import { effectiveStatus, likePattern, type Page } from "../common/catalog-list.js";
import { idsByOrdinal, normSql } from "../common/normalize.js";
import { CategoryEntity, LobbyEntity, StreamEntity, StreamInformationEntity } from "../database/entities/index.js";
import type { StreamListQueryDto } from "./dto/stream-list-query.dto.js";

export type StreamItem = {
  stream_id: string; stream_name: string; category_id: string; category_name: string;
  lobby_id: string; lobby_name: string; streamer_id: string | null; status: string;
};

const STREAM_COLUMNS = [
  "s.streamId AS stream_id", "s.streamName AS stream_name",
  "s.categoryId AS category_id", "c.categoryName AS category_name",
  "c.lobbyId AS lobby_id", "l.lobbyName AS lobby_name",
  "si.streamerId AS streamer_id", "s.status AS status",
];

export type StreamInput = { categoryId: string; name: string };

@Injectable()
export class StreamsService {
  constructor(@InjectRepository(StreamEntity) private repo: Repository<StreamEntity>) {}

  /** Query gốc: USER chỉ thấy stream ACTIVE có category + lobby cha ACTIVE. */
  private base(role: Role) {
    const qb = this.repo.createQueryBuilder("s")
      .innerJoin(CategoryEntity, "c", "c.categoryId = s.categoryId")
      .innerJoin(LobbyEntity, "l", "l.lobbyId = c.lobbyId")
      .leftJoin(StreamInformationEntity, "si", "si.streamId = s.streamId");
    if (role === "USER") {
      qb.andWhere("s.status = :visible AND c.status = :visible AND l.status = :visible", { visible: CatalogStatus.ACTIVE });
    }
    return qb;
  }

  async getOne(role: Role, id: string): Promise<StreamItem> {
    const row = await this.base(role).andWhere("s.streamId = :id", { id }).select(STREAM_COLUMNS).getRawOne<StreamItem>();
    if (!row) throw new NotFoundException();
    return row;
  }

  async list(role: Role, dto: StreamListQueryDto): Promise<Page<StreamItem>> {
    const qb = this.base(role);
    const status = effectiveStatus(role, dto.status);
    if (status) qb.andWhere("s.status = :status", { status });
    if (dto.lobby_id) qb.andWhere("c.lobbyId = :lobbyId", { lobbyId: dto.lobby_id });
    if (dto.category_id) qb.andWhere("s.categoryId = :categoryId", { categoryId: dto.category_id });
    if (dto.q?.trim()) qb.andWhere("s.streamName ILIKE :q", { q: likePattern(dto.q) });

    const total = await qb.getCount();
    const rows = await qb
      .select(STREAM_COLUMNS)
      .orderBy("l.lobbyName", "ASC").addOrderBy("c.categoryName", "ASC")
      .addOrderBy("s.streamName", "ASC").addOrderBy("s.streamId", "ASC")
      .offset((dto.page - 1) * dto.limit).limit(dto.limit)
      .getRawMany<StreamItem>();
    return { items: rows, total, page: dto.page, limit: dto.limit };
  }

  /** Trả về stream_id theo đúng thứ tự đầu vào. */
  async upsertMany(m: EntityManager, items: StreamInput[]): Promise<string[]> {
    if (items.length === 0) return [];
    const categoryIds = items.map((i) => i.categoryId);
    const names = items.map((i) => i.name);
    await m.query(
      `INSERT INTO streams (category_id, stream_name)
       SELECT * FROM unnest($1::uuid[], $2::text[])
       ON CONFLICT (category_id, (${normSql("stream_name")})) DO NOTHING`,
      [categoryIds, names],
    );
    const rows = await m.query(
      `SELECT i.ord::text AS ord, s.stream_id::text AS id
       FROM unnest($1::uuid[], $2::text[]) WITH ORDINALITY AS i(category_id, name, ord)
       JOIN streams s ON s.category_id = i.category_id AND ${normSql("s.stream_name")} = ${normSql("i.name")}`,
      [categoryIds, names],
    );
    return idsByOrdinal(rows, items.length);
  }
}
