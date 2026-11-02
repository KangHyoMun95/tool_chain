// src/game-sessions/game-sessions.service.ts
import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { GameSessionStatus } from "@toolhackchain/shared";

export type NewSession = { id: string; streamId: string; shoe: number; round: number };
export type SessionResult = { id: string; result: string };
export type ApplyResultsOutcome = {
  stored: Map<string, string>;   // id → result đang lưu trong DB (ván có result)
  cancelled: Set<string>;        // id của ván đã CANCELLED, chưa có result: không cập nhật
};

@Injectable()
export class GameSessionsService {
  /** Chỉ insert ván chưa có; không set status (để mặc định của DB = RUNNING), không đụng ván đã tồn tại. */
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
   * Ghi result VÀ set FINISHED trong cùng một câu UPDATE (atomic). Đây là chuyển trạng thái DUY NHẤT ingestion được làm.
   * Không bao giờ ghi đè result đã có; ván CANCELLED không được cập nhật.
   */
  async applyResults(m: EntityManager, items: SessionResult[]): Promise<ApplyResultsOutcome> {
    const out: ApplyResultsOutcome = { stored: new Map(), cancelled: new Set() };
    if (items.length === 0) return out;
    const ids = items.map((i) => i.id);
    const updated: { id: string }[] = await m.query(
      `UPDATE game_sessions g SET result = v.result, status = $3
       FROM unnest($1::uuid[], $2::varchar[]) AS v(id, result)
       WHERE g.game_session_id = v.id AND g.result IS NULL AND g.status <> $4
       RETURNING g.game_session_id AS id`,
      [ids, items.map((i) => i.result), GameSessionStatus.FINISHED, GameSessionStatus.CANCELLED],
    );
    const written = new Set(updated.map((r) => r.id));
    for (const it of items) if (written.has(it.id)) out.stored.set(it.id, it.result);

    const rest = ids.filter((id) => !written.has(id));
    if (rest.length > 0) {
      const rows: { id: string; result: string | null; status: string }[] = await m.query(
        `SELECT game_session_id AS id, result, status FROM game_sessions WHERE game_session_id = ANY($1::uuid[])`,
        [rest],
      );
      for (const r of rows) {
        if (r.result !== null) out.stored.set(r.id, r.result);
        else if (r.status === GameSessionStatus.CANCELLED) out.cancelled.add(r.id);
      }
    }
    return out;
  }
}
