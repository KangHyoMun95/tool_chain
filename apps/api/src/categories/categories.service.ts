// src/categories/categories.service.ts
import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { idsByOrdinal, normSql } from "../common/normalize.js";

export type CategoryInput = { lobbyId: string; name: string };

@Injectable()
export class CategoriesService {
  /** Trả về category_id theo đúng thứ tự đầu vào. */
  async upsertMany(m: EntityManager, items: CategoryInput[]): Promise<string[]> {
    if (items.length === 0) return [];
    const lobbyIds = items.map((i) => i.lobbyId);
    const names = items.map((i) => i.name);
    await m.query(
      `INSERT INTO categories (lobby_id, category_name)
       SELECT * FROM unnest($1::bigint[], $2::text[])
       ON CONFLICT (lobby_id, (${normSql("category_name")})) DO NOTHING`,
      [lobbyIds, names],
    );
    const rows = await m.query(
      `SELECT i.ord::text AS ord, c.category_id::text AS id
       FROM unnest($1::bigint[], $2::text[]) WITH ORDINALITY AS i(lobby_id, name, ord)
       JOIN categories c ON c.lobby_id = i.lobby_id AND ${normSql("c.category_name")} = ${normSql("i.name")}`,
      [lobbyIds, names],
    );
    return idsByOrdinal(rows, items.length);
  }
}
