// src/users/user-prediction-history.service.ts
// Lịch sử dự đoán của một USER cho web-admin. Chỉ ĐỌC. Không dính tiền, không đổi win_rate dùng chung.
// Outcome ở đây TÁCH RIÊNG hòa (khác win_rate toàn hệ thống: hòa tính là thắng): total_win / (total_win + total_lose).
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { CategoryConfigService } from "../category-config/category-config.service.js";
import { normSql, normalizeName } from "../common/normalize.js";
import type { PredictionHistoryQueryDto } from "./dto/prediction-history-query.dto.js";
import { SubAdminsService } from "./sub-admins.service.js";

export type Outcome = "WIN" | "LOSE" | "DRAW";
export type PredictionHistoryItem = {
  time: Date; lobby_name: string; category_name: string; stream_name: string;
  game_shoe: number; game_round: number; outcome: Outcome;
};
export type PredictionHistoryStats = { total_win: number; total_lose: number; total_draw: number; win_rate: number | null };
export type PredictionHistoryPage = {
  items: PredictionHistoryItem[]; total: number; page: number; limit: number; stats: PredictionHistoryStats;
};
export type PredictionHistoryFilters = {
  lobbies: { lobby_id: string; lobby_name: string }[];
  categories: { category_id: string; category_name: string; lobby_id: string }[];
  streams: { stream_id: string; stream_name: string; category_id: string }[];
};

// Ván có dự đoán (predict_result khác NULL), đã FINISHED và có result. Lượt xem lucky time (NỔ HŨ) nằm bảng khác nên không lẫn vào.
const FROM_WHERE = `
  FROM prediction_subscriptions ps
  JOIN predictions p ON p.prediction_id = ps.prediction_id
  JOIN game_sessions g ON g.game_session_id = p.game_session_id
  JOIN streams s ON s.stream_id = g.stream_id
  JOIN categories c ON c.category_id = s.category_id
  JOIN lobbies l ON l.lobby_id = c.lobby_id
  WHERE ps.user_id = $1 AND p.predict_result IS NOT NULL AND g.status = 'FINISHED' AND g.result IS NOT NULL`;

@Injectable()
export class UserPredictionHistoryService {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private subAdmins: SubAdminsService,
    private categories: CategoryConfigService,
  ) {}

  /** Phạm vi như trang chi tiết user (ngoài cây ⇒ 403). Trả false nếu user không phải USER (⇒ danh sách rỗng). */
  private async assertUser(actor: AuthUser, userId: string): Promise<boolean> {
    return (await this.subAdmins.detail(actor, userId)).role === "USER";
  }

  /** `draw` của từng category dạng dòng (key = `lobby|category` đã chuẩn hóa, s = ký hiệu hòa); không có file ⇒ không có hòa. */
  private drawRows(): string {
    const rows: { k: string; s: string }[] = [];
    for (const c of this.categories.all()) {
      for (const s of c.draw) rows.push({ k: `${normalizeName(c.lobby)}|${normalizeName(c.category)}`, s });
    }
    return JSON.stringify(rows);
  }

  async list(actor: AuthUser, userId: string, q: PredictionHistoryQueryDto): Promise<PredictionHistoryPage> {
    const empty: PredictionHistoryPage = {
      items: [], total: 0, page: q.page, limit: q.limit,
      stats: { total_win: 0, total_lose: 0, total_draw: 0, win_rate: null },
    };
    if (!(await this.assertUser(actor, userId))) return empty;

    const params: unknown[] = [userId, this.drawRows()];
    let where = "";
    const add = (cond: (n: string) => string, v: unknown) => { params.push(v); where += ` AND ${cond(`$${params.length}`)}`; };
    if (q.from) add((n) => `g.created_at >= ${n}::timestamptz`, q.from);
    if (q.to) add((n) => `g.created_at <= ${n}::timestamptz`, q.to);
    if (q.lobby_id) add((n) => `l.lobby_id = ${n}::uuid`, q.lobby_id);
    if (q.category_id) add((n) => `c.category_id = ${n}::uuid`, q.category_id);
    if (q.stream_id) add((n) => `s.stream_id = ${n}::uuid`, q.stream_id);
    if (q.game_shoe !== undefined) add((n) => `g.road_shoe = ${n}::int`, q.game_shoe);
    if (q.game_round !== undefined) add((n) => `g.road_count = ${n}::int`, q.game_round);

    // WIN trước, rồi DRAW (draw ∩ predictable = ∅ nên không chồng nhau), còn lại LOSE.
    const outcome = `CASE WHEN g.result = p.predict_result THEN 'WIN'
      WHEN EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS d(k text, s text)
                   WHERE d.k = ${normSql("l.lobby_name")} || '|' || ${normSql("c.category_name")} AND d.s = g.result) THEN 'DRAW'
      ELSE 'LOSE' END`;
    const base = `WITH h AS (
      SELECT g.created_at AS time, l.lobby_name, c.category_name, s.stream_name, g.road_shoe AS game_shoe, g.road_count AS game_round,
             ps.prediction_subscription_id AS sid, ${outcome} AS outcome
      ${FROM_WHERE}${where})`;

    const [items, stat] = await Promise.all([
      this.dataSource.query(
        `-- top-level: SELECT
         ${base}
         SELECT time, lobby_name, category_name, stream_name, game_shoe, game_round, outcome FROM h
         ORDER BY time DESC, sid LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, q.limit, (q.page - 1) * q.limit],
      ),
      this.dataSource.query(
        `-- top-level: SELECT
         ${base}
         SELECT count(*) FILTER (WHERE outcome = 'WIN')::int AS win, count(*) FILTER (WHERE outcome = 'LOSE')::int AS lose,
                count(*) FILTER (WHERE outcome = 'DRAW')::int AS draw FROM h`,
        params,
      ),
    ]);
    const { win, lose, draw } = stat[0] as { win: number; lose: number; draw: number };
    return {
      items, total: win + lose + draw, page: q.page, limit: q.limit,
      stats: { total_win: win, total_lose: lose, total_draw: draw, win_rate: win + lose > 0 ? win / (win + lose) : null },
    };
  }

  async filters(actor: AuthUser, userId: string): Promise<PredictionHistoryFilters> {
    if (!(await this.assertUser(actor, userId))) return { lobbies: [], categories: [], streams: [] };
    const rows: { lobby_id: string; lobby_name: string; category_id: string; category_name: string; stream_id: string; stream_name: string }[] =
      await this.dataSource.query(
        `-- top-level: SELECT
         SELECT DISTINCT l.lobby_id, l.lobby_name, c.category_id, c.category_name, s.stream_id, s.stream_name
         ${FROM_WHERE}
         ORDER BY l.lobby_name, c.category_name, s.stream_name`,
        [userId],
      );
    const lobbies = new Map<string, { lobby_id: string; lobby_name: string }>();
    const categories = new Map<string, { category_id: string; category_name: string; lobby_id: string }>();
    const streams: PredictionHistoryFilters["streams"] = [];
    for (const r of rows) {
      lobbies.set(r.lobby_id, { lobby_id: r.lobby_id, lobby_name: r.lobby_name });
      categories.set(r.category_id, { category_id: r.category_id, category_name: r.category_name, lobby_id: r.lobby_id });
      streams.push({ stream_id: r.stream_id, stream_name: r.stream_name, category_id: r.category_id });
    }
    return { lobbies: [...lobbies.values()], categories: [...categories.values()], streams };
  }
}
