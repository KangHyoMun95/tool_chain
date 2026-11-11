// src/predictions/predictions.service.ts
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { CatalogStatus, GameSessionStatus, type ChosenPattern, type PredictResult, type PredictionDetail, type PredictionEvent, type PredictionReason, type Role } from "@toolhackchain/shared";
import type { AuthUser } from "../auth/auth.types.js";
import { GameSessionEntity, PredictionEntity } from "../database/entities/index.js";
import { GameSessionsService } from "../game-sessions/game-sessions.service.js";
import { BillingService, type ChargeOutcome } from "../billing/billing.service.js";
import { LIVE_WITHIN_MS, STATS_RECENT_RESULTS, STATS_SHOES, STATS_STREAK_WINDOW } from "./predictions.constants.js";

export type CurrentPrediction = {
  prediction_id: string;
  game_session_id: string;
  stream_id: string;
  shoe: number;
  round: number;
  pick: "B" | "P" | null;
  confidence: number | null;      // 0–1
  chosen: ChosenPattern | null;
  reason: PredictionReason;
  model_version: string;
  created_at: Date;
  session_status: string;         // trạng thái game_session của ván (nội bộ, không trả ra API)
};

/**
 * GET /streams/:id/predictions/current. Ván còn RUNNING có pick: chỉ user đã bị trừ tiền cho ván đó mới thấy pick,
 * người khác (kể cả HOST / ADMIN) nhận locked. Ván đã FINISHED / CANCELLED, hoặc pick = null: công khai.
 */
export type CurrentPredictionView =
  | ({ locked: false } & Omit<CurrentPrediction, "session_status">)
  | { locked: true; prediction_id: string; game_session_id: string; stream_id: string; shoe: number; round: number; created_at: Date };

export type PredictionStats = {
  shoe: number | null;             // shoe hiện tại = shoe của dự đoán mới nhất của stream; null khi chưa có dự đoán nào
  wins: number;                    // các số dưới đây chỉ tính trong shoe hiện tại
  losses: number;
  draws: number;                   // kết quả T: không tính thắng / thua
  win_rate: number | null;         // wins / (wins + losses), 0–1; null khi shoe hiện tại chưa có ván nào để tính
  win_streak: number;              // số dự đoán thắng liên tiếp tính từ ván mới nhất (bỏ qua ván hòa), xét trong STATS_STREAK_WINDOW dự đoán
  shoes: {                         // tỷ lệ thắng của từng shoe QUÁ KHỨ (không gồm shoe hiện tại), tối đa STATS_SHOES shoe gần nhất, cũ → mới
    shoe: number; wins: number; losses: number; draws: number; win_rate: number;
  }[];
};

export type StreamListStats = {
  stream_id: string;
  shoe: number | null;             // shoe hiện tại (shoe của dự đoán mới nhất)
  round: number | null;            // ván mới nhất của stream (road_count của game_session mới nhất)
  live: boolean;                   // có ván mới trong LIVE_WITHIN_MS gần đây
  wins: number;                    // chỉ của shoe hiện tại
  losses: number;
  draws: number;
  win_rate: number | null;         // wins / (wins + losses) của shoe hiện tại, 0–1; null khi chưa có ván nào
  win_streak: number;
  recent: RecentResult[];          // tối đa STATS_RECENT_RESULTS dự đoán gần nhất của shoe hiện tại (bỏ ván hòa; ít hơn thì lấy đúng số đang có), cũ → mới
};

/** Một dự đoán đã chấm của ván FINISHED (công khai). win = pick trùng result. */
export type RecentResult = { pick: "B" | "P"; result: "B" | "P"; win: boolean };

@Injectable()
export class PredictionsService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    private sessions: GameSessionsService,
    private billing: BillingService,
  ) {}

  /**
   * Một transaction: đảm bảo game_sessions tồn tại (khóa ngoại; ván có thể còn nằm trong batch của ingestion),
   * insert prediction, và nếu là dòng MỚI có pick thì trừ tiền các participant (BillingService.charge) — cùng commit.
   * Trả null nếu ván đã có prediction (retry / trùng): không trừ lại, không đẩy SSE lại.
   */
  async insertFromResult(msg: PredictResult, participantIds: string[]): Promise<{ createdAt: Date; charge: ChargeOutcome | null } | null> {
    const detail: PredictionDetail = {
      chosen: msg.chosen, rows: msg.detail, history_used: msg.history_used, missing_previous: msg.missing_previous,
    };
    return this.ds.transaction(async (m) => {
      await this.sessions.insertMany(m, [{ id: msg.game_session_id, streamId: msg.stream_id, shoe: msg.shoe, round: msg.round }]);
      const rows: { created_at: Date }[] = await m.query(
        `INSERT INTO predictions (prediction_id, stream_id, game_session_id, predict_result, confidence_score, detail, model_version, reason)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (game_session_id) DO NOTHING
         RETURNING created_at`,
        [msg.prediction_id, msg.stream_id, msg.game_session_id, msg.pick, msg.confidence, JSON.stringify(detail), msg.model_version, msg.reason],
      );
      if (!rows[0]) return null;
      // pick = null (AI không dự đoán) ⇒ không trừ tiền ai.
      const charge = msg.pick === null ? null : await this.billing.charge(m, msg.prediction_id, msg.game_session_id, participantIds);
      return { createdAt: rows[0].created_at, charge };
    });
  }

  /** Prediction mới nhất của stream (theo thời điểm tạo), kèm shoe/round của ván. null nếu chưa có. */
  async current(streamId: string): Promise<CurrentPrediction | null> {
    const r = await this.ds.createQueryBuilder()
      .select([
        "p.predictionId AS prediction_id", "p.gameSessionId AS game_session_id", "p.streamId AS stream_id",
        "gs.roadShoe AS shoe", "gs.roadCount AS round", "p.predictResult AS pick", "p.confidenceScore AS confidence",
        "p.detail AS detail", "p.reason AS reason", "p.modelVersion AS model_version", "p.createdAt AS created_at",
        "gs.status AS session_status",
      ])
      .from(PredictionEntity, "p")
      .innerJoin(GameSessionEntity, "gs", "gs.gameSessionId = p.gameSessionId")
      .where("p.streamId = :streamId", { streamId })
      .orderBy("p.createdAt", "DESC").addOrderBy("p.predictionId")
      .limit(1)
      .getRawOne();
    if (!r) return null;
    const detail = r.detail as PredictionDetail;
    return {
      prediction_id: r.prediction_id, game_session_id: r.game_session_id, stream_id: r.stream_id,
      shoe: Number(r.shoe), round: Number(r.round), pick: r.pick, confidence: r.confidence === null ? null : Number(r.confidence),
      chosen: detail.chosen, reason: r.reason, model_version: r.model_version, created_at: r.created_at,
      session_status: r.session_status,
    };
  }

  /** Prediction mới nhất của stream theo góc nhìn của actor (xem CurrentPredictionView). null nếu chưa có. */
  async currentFor(actor: AuthUser, streamId: string): Promise<CurrentPredictionView | null> {
    const p = await this.current(streamId);
    if (!p) return null;
    const { session_status, ...pub } = p;
    if (session_status !== GameSessionStatus.RUNNING || p.pick === null) return { locked: false, ...pub };
    if (actor.role === "USER" && await this.claimSubscription(p.prediction_id, actor.userId)) return { locked: false, ...pub };
    return {
      locked: true, prediction_id: p.prediction_id, game_session_id: p.game_session_id, stream_id: p.stream_id,
      shoe: p.shoe, round: p.round, created_at: p.created_at,
    };
  }

  /** true nếu user đã bị trừ tiền cho prediction này; đồng thời set delivered_at nếu chưa có (pick được giao qua API). */
  private async claimSubscription(predictionId: string, userId: string): Promise<boolean> {
    const rows: { subscribed: boolean }[] = await this.ds.query(
      `-- top-level: SELECT (rows trả về bình thường, không dùng updateReturning)
       WITH s AS (
         SELECT prediction_subscription_id FROM prediction_subscriptions WHERE prediction_id = $1 AND user_id = $2),
       d AS (
         UPDATE prediction_subscriptions ps SET delivered_at = now()
         FROM s WHERE ps.prediction_subscription_id = s.prediction_subscription_id AND ps.delivered_at IS NULL
         RETURNING 1)
       SELECT EXISTS (SELECT 1 FROM s) AS subscribed`,
      [predictionId, userId]);
    return rows[0]?.subscribed === true;
  }

  /** Dữ liệu event SSE của một prediction đã lưu (giao lại khi xử lý lại message). null nếu không có. */
  async eventData(predictionId: string): Promise<PredictionEvent | null> {
    const rows: {
      game_session_id: string; stream_id: string; shoe: number; round: number; pick: "B" | "P" | null;
      confidence: string | null; detail: PredictionDetail; reason: PredictionReason; created_at: Date;
    }[] = await this.ds.query(
      `SELECT p.game_session_id, p.stream_id, gs.road_shoe AS shoe, gs.road_count AS round, p.predict_result AS pick,
              p.confidence_score AS confidence, p.detail, p.reason, p.created_at
       FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
       WHERE p.prediction_id = $1`, [predictionId]);
    const r = rows[0];
    if (!r) return null;
    return {
      game_session_id: r.game_session_id, stream_id: r.stream_id, shoe: Number(r.shoe), round: Number(r.round),
      pick: r.pick, confidence: r.confidence === null ? null : Number(r.confidence), chosen: r.detail.chosen,
      reason: r.reason, created_at: new Date(r.created_at).toISOString(),
    };
  }

  /**
   * Thống kê dự đoán của một stream. Thắng = pick trùng result; kết quả T là hòa (chưa tính đúng / sai, như UI);
   * ván không có pick (AI không dự đoán) hoặc chưa FINISHED không được tính.
   * Tỷ lệ thắng hiện tại chỉ của shoe hiện tại; biểu đồ là tỷ lệ thắng của từng shoe gần nhất.
   */
  async stats(streamId: string): Promise<PredictionStats> {
    const cur: { shoe: string }[] = await this.ds.query(
      `SELECT gs.road_shoe AS shoe
       FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
       WHERE p.stream_id = $1
       ORDER BY p.created_at DESC LIMIT 1`,
      [streamId]);
    const currentShoe = cur[0] ? Number(cur[0].shoe) : null;

    // Mỗi dòng một shoe, sắp theo dự đoán đã chấm mới nhất của shoe đó (mới → cũ).
    const rows: { shoe: string; wins: string; losses: string; draws: string }[] = await this.ds.query(
      `SELECT gs.road_shoe AS shoe,
              count(*) FILTER (WHERE gs.result <> 'T' AND p.predict_result = gs.result) AS wins,
              count(*) FILTER (WHERE gs.result <> 'T' AND p.predict_result <> gs.result) AS losses,
              count(*) FILTER (WHERE gs.result = 'T') AS draws
       FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
       WHERE p.stream_id = $1 AND p.predict_result IS NOT NULL AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
       GROUP BY gs.road_shoe
       ORDER BY max(p.created_at) DESC LIMIT $2`,
      [streamId, STATS_SHOES + 1]);   // mới → cũ
    const perShoe = rows.map((r) => {
      const wins = Number(r.wins), losses = Number(r.losses);
      return { shoe: Number(r.shoe), wins, losses, draws: Number(r.draws), win_rate: wins + losses > 0 ? wins / (wins + losses) : null };
    });
    const now = perShoe.find((r) => r.shoe === currentShoe);

    const recent: { pick: string; result: string }[] = await this.ds.query(
      `SELECT p.predict_result AS pick, gs.result
       FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
       WHERE p.stream_id = $1 AND p.predict_result IS NOT NULL AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
       ORDER BY p.created_at DESC LIMIT $2`,
      [streamId, STATS_STREAK_WINDOW]);   // mới → cũ
    let streak = 0;
    for (const r of recent) {
      if (r.result === "T") continue;
      if (r.pick !== r.result) break;
      streak++;
    }

    return {
      shoe: currentShoe,
      wins: now?.wins ?? 0, losses: now?.losses ?? 0, draws: now?.draws ?? 0,
      win_rate: now?.win_rate ?? null,
      win_streak: streak,
      shoes: perShoe.filter((r) => r.shoe !== currentShoe && r.win_rate !== null).slice(0, STATS_SHOES).reverse() as PredictionStats["shoes"],
    };
  }

  /**
   * Thống kê của mọi stream trong một category cho danh sách bàn (vài truy vấn cho cả danh sách, không gọi từng bàn).
   * Cùng định nghĩa với stats(): thắng = pick trùng result, T là hòa, win_rate chỉ của shoe hiện tại.
   * Phạm vi nhìn thấy như GET /streams: USER chỉ thấy stream ACTIVE có category + lobby cha ACTIVE.
   */
  async listStats(role: Role, categoryId: string): Promise<StreamListStats[]> {
    const visible = role === "USER" ? "AND s.status = $2 AND c.status = $2 AND l.status = $2" : "";
    const params: unknown[] = role === "USER" ? [categoryId, CatalogStatus.ACTIVE] : [categoryId];
    const vis = `SELECT s.stream_id FROM streams s
                 JOIN categories c ON c.category_id = s.category_id JOIN lobbies l ON l.lobby_id = c.lobby_id
                 WHERE s.category_id = $1 ${visible}`;

    const latest: { stream_id: string; round: string; age_ms: string }[] = await this.ds.query(
      `SELECT DISTINCT ON (gs.stream_id) gs.stream_id, gs.road_count AS round,
              (extract(epoch FROM (now() - gs.created_at)) * 1000) AS age_ms
       FROM game_sessions gs WHERE gs.stream_id IN (${vis})
       ORDER BY gs.stream_id, gs.created_at DESC`, params);

    const cur: { stream_id: string; shoe: string; wins: string; losses: string; draws: string }[] = await this.ds.query(
      `WITH cur AS (
         SELECT DISTINCT ON (p.stream_id) p.stream_id, gs.road_shoe AS shoe
         FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
         WHERE p.stream_id IN (${vis})
         ORDER BY p.stream_id, p.created_at DESC)
       SELECT cur.stream_id, cur.shoe,
              count(*) FILTER (WHERE gs.result <> 'T' AND p.predict_result = gs.result) AS wins,
              count(*) FILTER (WHERE gs.result <> 'T' AND p.predict_result <> gs.result) AS losses,
              count(*) FILTER (WHERE gs.result = 'T') AS draws
       FROM cur
       LEFT JOIN game_sessions gs ON gs.stream_id = cur.stream_id AND gs.road_shoe = cur.shoe
                                  AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
       LEFT JOIN predictions p ON p.game_session_id = gs.game_session_id AND p.predict_result IS NOT NULL
       GROUP BY cur.stream_id, cur.shoe`, params);

    const evaluated: { stream_id: string; shoe: string; pick: string; result: string }[] = await this.ds.query(
      `SELECT stream_id, shoe, pick, result FROM (
         SELECT p.stream_id, gs.road_shoe AS shoe, p.predict_result AS pick, gs.result,
                row_number() OVER (PARTITION BY p.stream_id ORDER BY p.created_at DESC) AS rn
         FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
         WHERE p.stream_id IN (${vis}) AND p.predict_result IS NOT NULL AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
       ) x WHERE rn <= $${params.length + 1} ORDER BY stream_id, rn`,
      [...params, STATS_STREAK_WINDOW]);   // mỗi stream: mới → cũ

    const byStream = new Map<string, { shoe: string; pick: string; result: string }[]>();
    for (const r of evaluated) {
      const list = byStream.get(r.stream_id) ?? [];
      list.push(r);
      byStream.set(r.stream_id, list);
    }
    const ids = new Set([...latest.map((r) => r.stream_id), ...cur.map((r) => r.stream_id)]);
    return [...ids].map((id) => {
      const l = latest.find((r) => r.stream_id === id);
      const c = cur.find((r) => r.stream_id === id);
      const wins = Number(c?.wins ?? 0), losses = Number(c?.losses ?? 0);
      const rows = (byStream.get(id) ?? []).filter((r) => r.result !== "T");   // mới → cũ, bỏ ván hòa
      let streak = 0;
      for (const r of rows) { if (r.pick !== r.result) break; streak++; }
      return {
        stream_id: id,
        shoe: c ? Number(c.shoe) : null,
        round: l ? Number(l.round) : null,
        live: l ? Number(l.age_ms) <= LIVE_WITHIN_MS : false,
        wins, losses, draws: Number(c?.draws ?? 0),
        win_rate: wins + losses > 0 ? wins / (wins + losses) : null,
        win_streak: streak,
        recent: rows.filter((r) => Number(r.shoe) === (c ? Number(c.shoe) : null)).slice(0, STATS_RECENT_RESULTS).reverse()
          .map((r) => ({ pick: r.pick as RecentResult["pick"], result: r.result as RecentResult["result"], win: r.pick === r.result })),   // chỉ shoe hiện tại; ít hơn 10 thì lấy đúng số đang có
      };
    });
  }
}
