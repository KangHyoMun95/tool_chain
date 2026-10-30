// src/lobbies/lobbies.service.ts
import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { idsByOrdinal, normSql } from "../common/normalize.js";

@Injectable()
export class LobbiesService {
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
