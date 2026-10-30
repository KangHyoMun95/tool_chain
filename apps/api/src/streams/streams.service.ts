// src/streams/streams.service.ts
import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { idsByOrdinal, normSql } from "../common/normalize.js";

export type StreamInput = { categoryId: string; name: string };

@Injectable()
export class StreamsService {
  /** Trả về stream_id theo đúng thứ tự đầu vào. */
  async upsertMany(m: EntityManager, items: StreamInput[]): Promise<string[]> {
    if (items.length === 0) return [];
    const categoryIds = items.map((i) => i.categoryId);
    const names = items.map((i) => i.name);
    await m.query(
      `INSERT INTO streams (category_id, stream_name)
       SELECT * FROM unnest($1::bigint[], $2::text[])
       ON CONFLICT (category_id, (${normSql("stream_name")})) DO NOTHING`,
      [categoryIds, names],
    );
    const rows = await m.query(
      `SELECT i.ord::text AS ord, s.stream_id::text AS id
       FROM unnest($1::bigint[], $2::text[]) WITH ORDINALITY AS i(category_id, name, ord)
       JOIN streams s ON s.category_id = i.category_id AND ${normSql("s.stream_name")} = ${normSql("i.name")}`,
      [categoryIds, names],
    );
    return idsByOrdinal(rows, items.length);
  }
}
