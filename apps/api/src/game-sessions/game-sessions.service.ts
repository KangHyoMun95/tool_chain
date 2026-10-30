// src/game-sessions/game-sessions.service.ts
import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";

export type NewSession = { id: string; streamId: string; shoe: number; round: number };
export type SessionResult = { id: string; result: string };

@Injectable()
export class GameSessionsService {
  /** Chỉ insert ván chưa có; không set status (để mặc định của DB), không đụng ván đã tồn tại. */
  async insertMany(m: EntityManager, items: NewSession[]): Promise<void> {
    if (items.length === 0) return;
    await m.query(
      `INSERT INTO game_sessions (game_session_id, stream_id, road_shoe, road_count)
       SELECT * FROM unnest($1::uuid[], $2::bigint[], $3::int[], $4::int[])
       ON CONFLICT DO NOTHING`,
      [items.map((i) => i.id), items.map((i) => i.streamId), items.map((i) => i.shoe), items.map((i) => i.round)],
    );
  }

  /**
   * Ghi result chỉ khi ván chưa có result (không bao giờ ghi đè).
   * Trả về result đang lưu trong DB của mọi ván truyền vào (map id → result).
   */
  async applyResults(m: EntityManager, items: SessionResult[]): Promise<Map<string, string>> {
    const stored = new Map<string, string>();
    if (items.length === 0) return stored;
    const ids = items.map((i) => i.id);
    const updated: { id: string }[] = await m.query(
      `UPDATE game_sessions g SET result = v.result
       FROM unnest($1::uuid[], $2::varchar[]) AS v(id, result)
       WHERE g.game_session_id = v.id AND g.result IS NULL
       RETURNING g.game_session_id AS id`,
      [ids, items.map((i) => i.result)],
    );
    const written = new Set(updated.map((r) => r.id));
    for (const it of items) if (written.has(it.id)) stored.set(it.id, it.result);

    const rest = ids.filter((id) => !written.has(id));
    if (rest.length > 0) {
      const rows: { id: string; result: string | null }[] = await m.query(
        `SELECT game_session_id AS id, result FROM game_sessions WHERE game_session_id = ANY($1::uuid[])`,
        [rest],
      );
      for (const r of rows) if (r.result !== null) stored.set(r.id, r.result);
    }
    return stored;
  }
}
