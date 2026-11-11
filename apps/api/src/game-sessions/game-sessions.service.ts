// src/game-sessions/game-sessions.service.ts
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";
import { GameSessionStatus } from "@toolhackchain/shared";
import { updateReturning } from "../common/update-returning.js";

export type NewSession = { id: string; streamId: string; shoe: number; round: number };
export type SessionResult = { id: string; result: string };
export type ApplyResultsOutcome = {
  stored: Map<string, string>;   // id → result đang lưu trong DB (ván có result)
  cancelled: Set<string>;        // id của ván đã CANCELLED, chưa có result: không cập nhật
  finished: string[];            // id của ván VỪA được ghi result + FINISHED bởi câu UPDATE này (gửi settlement sau commit)
};

@Injectable()
export class GameSessionsService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  /** Lịch sử ván FINISHED của một stream theo shoe (mặc định: shoe của ván mới nhất), round giảm dần, kèm dự đoán của từng ván. */
  async history(streamId: string, shoe: number | undefined, page: number, limit: number) {
    if (shoe === undefined) {
      const latest: { road_shoe: number }[] = await this.ds.query(
        `SELECT road_shoe FROM game_sessions WHERE stream_id = $1 ORDER BY created_at DESC LIMIT 1`, [streamId]);
      if (latest.length === 0) return { shoe: null, items: [], total: 0, page, limit };
      shoe = latest[0].road_shoe;
    }
    const where = `stream_id = $1 AND road_shoe = $2 AND status = $3`;
    const args = [streamId, shoe, GameSessionStatus.FINISHED];
    const [{ count }]: { count: string }[] = await this.ds.query(`SELECT count(*) AS count FROM game_sessions WHERE ${where}`, args);
    const rows: {
      game_session_id: string; shoe: number; round: number; result: string | null; status: string; created_at: Date;
      pick: "B" | "P" | null; confidence: string | null;
    }[] = await this.ds.query(
      `SELECT g.game_session_id, g.road_shoe AS shoe, g.road_count AS round, g.result, g.status, g.created_at,
              p.predict_result AS pick, p.confidence_score AS confidence
       FROM game_sessions g
       LEFT JOIN predictions p ON p.game_session_id = g.game_session_id
       WHERE g.stream_id = $1 AND g.road_shoe = $2 AND g.status = $3
       ORDER BY g.road_count DESC, g.game_session_id LIMIT $4 OFFSET $5`,
      [...args, limit, (page - 1) * limit]);
    // pick / confidence: dự đoán của ván (null khi chưa có dự đoán hoặc AI không dự đoán); confidence là 0–1.
    const items = rows.map((r) => ({ ...r, confidence: r.confidence === null ? null : Number(r.confidence) }));
    return { shoe, items, total: Number(count), page, limit };
  }

  /** Chỉ insert ván chưa có; không set status (để mặc định của DB = RUNNING), không đụng ván đã tồn tại. */
  async insertMany(m: EntityManager, items: NewSession[]): Promise<void> {
    if (items.length === 0) return;
    await m.query(
      `INSERT INTO game_sessions (game_session_id, stream_id, road_shoe, road_count)
       SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::int[], $4::int[])
       ON CONFLICT DO NOTHING`,
      [items.map((i) => i.id), items.map((i) => i.streamId), items.map((i) => i.shoe), items.map((i) => i.round)],
    );
  }

  /**
   * Ghi result VÀ set FINISHED trong cùng một câu UPDATE (atomic). Đây là chuyển trạng thái DUY NHẤT ingestion được làm.
   * Không bao giờ ghi đè result đã có; ván CANCELLED không được cập nhật.
   */
  async applyResults(m: EntityManager, items: SessionResult[]): Promise<ApplyResultsOutcome> {
    const out: ApplyResultsOutcome = { stored: new Map(), cancelled: new Set(), finished: [] };
    if (items.length === 0) return out;
    const ids = items.map((i) => i.id);
    const updated = await updateReturning<{ id: string }>(
      m,
      `UPDATE game_sessions g SET result = v.result, status = $3, ended_at = now()
       FROM unnest($1::uuid[], $2::varchar[]) AS v(id, result)
       WHERE g.game_session_id = v.id AND g.result IS NULL AND g.status <> $4
       RETURNING g.game_session_id AS id`,
      [ids, items.map((i) => i.result), GameSessionStatus.FINISHED, GameSessionStatus.CANCELLED],
    );
    const written = new Set(updated.map((r) => r.id));
    out.finished = [...written];
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
