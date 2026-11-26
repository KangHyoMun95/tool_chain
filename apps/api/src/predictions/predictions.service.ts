// src/predictions/predictions.service.ts
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { CatalogStatus, GameSessionStatus, type ChosenPattern, type PredictResult, type PredictionDetail, type PredictionEvent, type PredictionReason, type ResultConfig, type Role } from "@toolhackchain/shared";
import type { AuthUser } from "../auth/auth.types.js";
import { GameSessionEntity, PredictionEntity } from "../database/entities/index.js";
import { GameSessionsService } from "../game-sessions/game-sessions.service.js";
import { BillingService, type ChargeOutcome } from "../billing/billing.service.js";
import { CategoryConfigService } from "../category-config/category-config.service.js";
import {
  LIST_STREAK_MIN, LIST_STREAK_MIN_ROUNDS, LIVE_WITHIN_MS, RECENT_RATE_LOOKBACK_DAYS, RECENT_RATE_MAX_SHOES, RECENT_RATE_MIN_ROUNDS, RECENT_RATE_SHOES, SLIDING_STREAK_FETCH, SLIDING_STREAK_SHOES,
  STATS_SHOES, STATS_STREAK_WINDOW,
} from "./predictions.constants.js";

export type CurrentPrediction = {
  prediction_id: string;
  game_session_id: string;
  stream_id: string;
  shoe: number;
  round: number;
  pick: string | null;
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
  draws: number;                   // kết quả thuộc `draw` của category: không tính thắng / thua
  win_rate: number | null;         // (wins + draws) / (wins + draws + losses), 0–1 (hòa tính là thắng, chỉ ở tỷ lệ này); null khi shoe hiện tại chưa có ván nào để tính
  win_streak: number;              // số dự đoán thắng liên tiếp tính từ ván mới nhất (bỏ qua ván hòa), xét trong STATS_STREAK_WINDOW dự đoán
  shoes: {                         // tỷ lệ thắng của từng shoe QUÁ KHỨ (không gồm shoe hiện tại), tối đa STATS_SHOES shoe gần nhất, cũ → mới
    shoe: number; wins: number; losses: number; draws: number; win_rate: number;
  }[];
};

export type BestStreak = {
  shoe: number | null;             // shoe hiện tại (shoe của dự đoán mới nhất); null khi chưa có dự đoán
  best_streak: number;             // chuỗi thắng dài nhất trong shoe đó (dự đoán đã chấm, T bỏ qua, thua đứt chuỗi); 0 khi chưa có
};

export type StreamListStats = {
  stream_id: string;
  shoe: number | null;             // shoe hiện tại (shoe của dự đoán mới nhất)
  round: number | null;            // ván mới nhất của stream (road_count của game_session mới nhất)
  live: boolean;                   // có ván mới trong LIVE_WITHIN_MS gần đây
  wins: number;                    // chỉ của shoe hiện tại
  losses: number;
  draws: number;
  win_rate: number | null;         // "tỷ lệ tốt gần đây" (xem recentBestRate()): tỷ lệ shoe cao nhất trong các shoe gần đây, 0–1 (hòa tính là thắng); null khi chưa shoe nào đủ lượt
  win_streak: number;              // xem listStreak(): chuỗi dài nhất của shoe hiện tại, hoặc của shoe trước khi shoe hiện tại còn ít
};

@Injectable()
export class PredictionsService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    private sessions: GameSessionsService,
    private billing: BillingService,
    private categoryConfigs: CategoryConfigService,
  ) {}

  /** Các ký hiệu "hòa" (draw) của category chứa stream; rỗng nếu category không có cấu hình (không xảy ra khi tick đã được nhận). */
  private async drawOfStream(streamId: string): Promise<string[]> {
    const rows: { lobby_name: string; category_name: string }[] = await this.ds.query(
      `SELECT l.lobby_name, c.category_name FROM streams s
       JOIN categories c ON c.category_id = s.category_id JOIN lobbies l ON l.lobby_id = c.lobby_id
       WHERE s.stream_id = $1`, [streamId]);
    return rows[0] ? this.categoryConfigs.get(rows[0].lobby_name, rows[0].category_name)?.draw ?? [] : [];
  }

  /** Cấu hình kết quả (nhãn, màu, draw, totals) của category; null khi không có file. */
  async resultConfigOfCategory(categoryId: string): Promise<ResultConfig | null> {
    const rows: { lobby_name: string; category_name: string }[] = await this.ds.query(
      `SELECT l.lobby_name, c.category_name FROM categories c JOIN lobbies l ON l.lobby_id = c.lobby_id WHERE c.category_id = $1`, [categoryId]);
    return rows[0] ? this.categoryConfigs.resultConfig(rows[0].lobby_name, rows[0].category_name) : null;
  }


  /**
   * Một transaction: đảm bảo game_sessions tồn tại (khóa ngoại; ván có thể còn nằm trong batch của ingestion),
   * insert prediction, và nếu là dòng MỚI có pick thì trừ tiền các participant (BillingService.charge) — cùng commit.
   * Trả null nếu ván đã có prediction (retry / trùng): không trừ lại, không đẩy SSE lại.
   */
  async insertFromResult(msg: PredictResult, participantIds: string[]): Promise<{ createdAt: Date; charge: ChargeOutcome | null } | null> {
    const detail: PredictionDetail = {
      chosen: msg.chosen, rows: msg.detail, history_used: msg.history_used, missing_previous: msg.missing_previous,
      half_life_minutes: msg.half_life_minutes, shoe_weight: msg.shoe_weight,
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
      game_session_id: string; stream_id: string; shoe: number; round: number; pick: string | null;
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
   * Thống kê dự đoán của một stream. Thắng = pick trùng result; kết quả thuộc `draw` của category là hòa (chưa tính đúng / sai, như UI);
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
    const draw = await this.drawOfStream(streamId);

    // Mỗi dòng một shoe, sắp theo dự đoán đã chấm mới nhất của shoe đó (mới → cũ).
    const rows: { shoe: string; wins: string; losses: string; draws: string }[] = await this.ds.query(
      `SELECT gs.road_shoe AS shoe,
              count(*) FILTER (WHERE gs.result <> ALL($3::text[]) AND p.predict_result = gs.result) AS wins,
              count(*) FILTER (WHERE gs.result <> ALL($3::text[]) AND p.predict_result <> gs.result) AS losses,
              count(*) FILTER (WHERE gs.result = ANY($3::text[])) AS draws
       FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
       WHERE p.stream_id = $1 AND p.predict_result IS NOT NULL AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
       GROUP BY gs.road_shoe
       ORDER BY max(p.created_at) DESC LIMIT $2`,
      [streamId, STATS_SHOES + 1, draw]);   // mới → cũ
    const perShoe = rows.map((r) => {
      const wins = Number(r.wins), losses = Number(r.losses);
      return { shoe: Number(r.shoe), wins, losses, draws: Number(r.draws), win_rate: winRate(wins, losses, Number(r.draws)) };
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
      if (draw.includes(r.result)) continue;
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

  /** Chuỗi thắng tốt nhất của shoe hiện tại của stream (cho trang chi tiết). Cùng định nghĩa "shoe hiện tại" và thắng / hòa như stats(). */
  async bestStreak(streamId: string): Promise<BestStreak> {
    const cur: { shoe: string }[] = await this.ds.query(
      `SELECT gs.road_shoe AS shoe
       FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
       WHERE p.stream_id = $1
       ORDER BY p.created_at DESC LIMIT 1`,
      [streamId]);
    if (!cur[0]) return { shoe: null, best_streak: 0 };
    const rows: { pick: string; result: string }[] = await this.ds.query(
      `SELECT p.predict_result AS pick, gs.result
       FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
       WHERE p.stream_id = $1 AND gs.road_shoe = $2 AND p.predict_result IS NOT NULL
         AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
       ORDER BY p.created_at`,   // cũ → mới
      [streamId, cur[0].shoe]);
    return { shoe: Number(cur[0].shoe), best_streak: longestWinStreak(rows, await this.drawOfStream(streamId)) };
  }

  /**
   * Chuỗi dự đoán đúng liên tiếp dài nhất, trượt qua nhiều shoe, của mọi stream trong một category (một truy vấn cho cả danh sách).
   * Mỗi stream: cửa sổ = SLIDING_STREAK_SHOES (3) shoe gần nhất, gồm cả shoe hiện tại (shoe của dự đoán mới nhất). Các shoe nối theo thời gian nên chuỗi được phép vắt qua ranh giới shoe. Ván hòa (result thuộc `draw` của category) tính là
   * đúng và KHÔNG đứt chuỗi; dự đoán sai thì đứt. Stream chưa có dự đoán đã chấm: best_streak = 0.
   * Phạm vi nhìn thấy như GET /streams (USER chỉ thấy stream ACTIVE có category + lobby cha ACTIVE). Thứ tự shoe theo thời điểm
   * dự đoán; cùng số shoe = cùng một shoe (như stats()). Mỗi stream chỉ đọc SLIDING_STREAK_FETCH dự đoán mới nhất.
   *
   * TODO: CHƯA có endpoint / chưa được gọi ở đâu. Bổ sung API (vd GET /categories/:id/...) ở PR sau, cần kiểm tra phạm vi category như stream-stats.
   */
  async slidingBestStreaks(role: Role, categoryId: string): Promise<{ stream_id: string; best_streak: number }[]> {
    const visible = role === "USER" ? "AND s.status = $2 AND c.status = $2 AND l.status = $2" : "";
    const draw = (await this.resultConfigOfCategory(categoryId))?.draw ?? [];
    const params: unknown[] = role === "USER" ? [categoryId, CatalogStatus.ACTIVE] : [categoryId];
    const rows: { stream_id: string; shoe: string; pick: string | null; result: string | null }[] = await this.ds.query(
      `WITH vis AS (
         SELECT s.stream_id FROM streams s
         JOIN categories c ON c.category_id = s.category_id JOIN lobbies l ON l.lobby_id = c.lobby_id
         WHERE s.category_id = $1 ${visible})
       SELECT v.stream_id, x.shoe, x.pick, x.result FROM vis v
       LEFT JOIN LATERAL (
         SELECT gs.road_shoe AS shoe, p.predict_result AS pick, gs.result, p.created_at
         FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
         WHERE p.stream_id = v.stream_id AND p.predict_result IS NOT NULL AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
         ORDER BY p.created_at DESC LIMIT ${SLIDING_STREAK_FETCH}) x ON true
       ORDER BY v.stream_id, x.created_at`,   // mỗi stream: cũ → mới
      params);
    const byStream = new Map<string, { shoe: number; pick: string; result: string }[]>();
    for (const r of rows) {
      const list = byStream.get(r.stream_id) ?? [];
      if (r.pick !== null && r.result !== null) list.push({ shoe: Number(r.shoe), pick: r.pick, result: r.result });
      byStream.set(r.stream_id, list);
    }
    return [...byStream].map(([stream_id, list]) => ({ stream_id, best_streak: slidingStreak(list, draw) }));
  }

  /**
   * Thống kê của mọi stream trong một category cho danh sách bàn (ba truy vấn song song cho cả danh sách, không gọi từng bàn).
   * Cùng định nghĩa với stats(): thắng = pick trùng result, T là hòa, win_rate chỉ của shoe hiện tại.
   * Phạm vi nhìn thấy như GET /streams: USER chỉ thấy stream ACTIVE có category + lobby cha ACTIVE.
   */
  async listStats(role: Role, categoryId: string): Promise<StreamListStats[]> {
    const visible = role === "USER" ? "AND s.status = $2 AND c.status = $2 AND l.status = $2" : "";
    const draw = (await this.resultConfigOfCategory(categoryId))?.draw ?? [];
    const params: unknown[] = role === "USER" ? [categoryId, CatalogStatus.ACTIVE] : [categoryId];
    const drawParam = `$${params.length + 1}`;
    const vis = `SELECT s.stream_id FROM streams s
                 JOIN categories c ON c.category_id = s.category_id JOIN lobbies l ON l.lobby_id = c.lobby_id
                 WHERE s.category_id = $1 ${visible}`;

    // Mỗi stream chỉ đọc vài dòng mới nhất (LATERAL ... LIMIT 1 trên idx_game_sessions_stream_created / idx_predictions_stream_created),
    // không quét toàn bộ lịch sử. Ba truy vấn độc lập nên chạy song song.
    const curShoe = `vis AS (${vis}),
         cur AS (
           SELECT v.stream_id, c.shoe FROM vis v
           CROSS JOIN LATERAL (
             SELECT gs.road_shoe AS shoe FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
             WHERE p.stream_id = v.stream_id ORDER BY p.created_at DESC LIMIT 1) c)`;

    const latestQ: Promise<{ stream_id: string; round: string; age_ms: string }[]> = this.ds.query(
      `WITH vis AS (${vis})
       SELECT v.stream_id, l.round, l.age_ms FROM vis v
       CROSS JOIN LATERAL (
         SELECT gs.road_count AS round, (extract(epoch FROM (now() - gs.created_at)) * 1000) AS age_ms
         FROM game_sessions gs WHERE gs.stream_id = v.stream_id ORDER BY gs.created_at DESC LIMIT 1) l`, params);

    const curQ: Promise<{ stream_id: string; shoe: string; wins: string; losses: string; draws: string }[]> = this.ds.query(
      `WITH ${curShoe}
       SELECT cur.stream_id, cur.shoe,
              count(*) FILTER (WHERE p.game_session_id IS NOT NULL AND gs.result <> ALL(${drawParam}::text[]) AND p.predict_result = gs.result) AS wins,
              count(*) FILTER (WHERE p.game_session_id IS NOT NULL AND gs.result <> ALL(${drawParam}::text[]) AND p.predict_result <> gs.result) AS losses,
              count(*) FILTER (WHERE p.game_session_id IS NOT NULL AND gs.result = ANY(${drawParam}::text[])) AS draws
       FROM cur
       LEFT JOIN game_sessions gs ON gs.stream_id = cur.stream_id AND gs.road_shoe = cur.shoe
                                  AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
       LEFT JOIN predictions p ON p.game_session_id = gs.game_session_id AND p.predict_result IS NOT NULL
       GROUP BY cur.stream_id, cur.shoe`, [...params, draw]);

    // Dự đoán đã chấm của shoe hiện tại (rk = 1: shoe của dự đoán mới nhất) và shoe trước (rk = 2: shoe khác có dự đoán mới nhất
    // kế tiếp), theo thứ tự thời gian, để tính chuỗi thắng dài nhất của từng shoe.
    const evaluatedQ: Promise<{ stream_id: string; rk: string; pick: string; result: string }[]> = this.ds.query(
      `WITH ${curShoe},
         prev AS (
           SELECT cur.stream_id, pv.shoe FROM cur
           CROSS JOIN LATERAL (
             SELECT gs.road_shoe AS shoe FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
             WHERE p.stream_id = cur.stream_id AND gs.road_shoe <> cur.shoe ORDER BY p.created_at DESC LIMIT 1) pv),
         shoes AS (SELECT stream_id, shoe, 1 AS rk FROM cur UNION ALL SELECT stream_id, shoe, 2 AS rk FROM prev)
       SELECT s.stream_id, s.rk, p.predict_result AS pick, gs.result
       FROM shoes s
       JOIN game_sessions gs ON gs.stream_id = s.stream_id AND gs.road_shoe = s.shoe
                            AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
       JOIN predictions p ON p.game_session_id = gs.game_session_id AND p.predict_result IS NOT NULL
       ORDER BY s.stream_id, s.rk, p.created_at`, params);

    // Tỷ lệ từng shoe gần đây của mỗi stream (cho win_rate): tối đa RECENT_RATE_MAX_SHOES shoe trong RECENT_RATE_LOOKBACK_DAYS ngày,
    // mới → cũ theo dự đoán mới nhất; `today` = shoe có dự đoán trong ngày hôm nay (GMT+7, như dashboard).
    const tz = "Asia/Ho_Chi_Minh";
    const shoeRatesQ: Promise<{ stream_id: string; wins: string; losses: string; draws: string; today: boolean }[]> = this.ds.query(
      `WITH vis AS (${vis})
       SELECT v.stream_id, x.wins, x.losses, x.draws, x.today FROM vis v
       CROSS JOIN LATERAL (
         SELECT count(*) FILTER (WHERE gs.result <> ALL(${drawParam}::text[]) AND p.predict_result = gs.result) AS wins,
                count(*) FILTER (WHERE gs.result <> ALL(${drawParam}::text[]) AND p.predict_result <> gs.result) AS losses,
                count(*) FILTER (WHERE gs.result = ANY(${drawParam}::text[])) AS draws,
                bool_or((p.created_at AT TIME ZONE '${tz}')::date = (now() AT TIME ZONE '${tz}')::date) AS today,
                max(p.created_at) AS last_at
         FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
         WHERE p.stream_id = v.stream_id AND p.predict_result IS NOT NULL AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
           AND p.created_at > now() - interval '${RECENT_RATE_LOOKBACK_DAYS} days'
         GROUP BY gs.road_shoe ORDER BY max(p.created_at) DESC LIMIT ${RECENT_RATE_MAX_SHOES}) x
       ORDER BY v.stream_id, x.last_at DESC`, [...params, draw]);   // mỗi stream: mới → cũ

    const [latest, cur, evaluated, shoeRates] = await Promise.all([latestQ, curQ, evaluatedQ, shoeRatesQ]);
    const ratesByStream = new Map<string, { wins: number; losses: number; draws: number; today: boolean }[]>();
    for (const r of shoeRates) {
      const list = ratesByStream.get(r.stream_id) ?? [];
      list.push({ wins: Number(r.wins), losses: Number(r.losses), draws: Number(r.draws), today: r.today });
      ratesByStream.set(r.stream_id, list);
    }

    const byShoe = new Map<string, { pick: string; result: string }[]>();   // `${stream_id}|${rk}` → cũ → mới
    for (const r of evaluated) {
      const k = `${r.stream_id}|${Number(r.rk)}`;
      const list = byShoe.get(k) ?? [];
      list.push(r);
      byShoe.set(k, list);
    }
    const ids = new Set([...latest.map((r) => r.stream_id), ...cur.map((r) => r.stream_id)]);
    return [...ids].map((id) => {
      const l = latest.find((r) => r.stream_id === id);
      const c = cur.find((r) => r.stream_id === id);
      const wins = Number(c?.wins ?? 0), losses = Number(c?.losses ?? 0), draws = Number(c?.draws ?? 0);
      return {
        stream_id: id,
        shoe: c ? Number(c.shoe) : null,
        round: l ? Number(l.round) : null,
        live: l ? Number(l.age_ms) <= LIVE_WITHIN_MS : false,
        wins, losses, draws,
        win_rate: recentBestRate(ratesByStream.get(id) ?? []),
        win_streak: listStreak(byShoe.get(`${id}|1`) ?? [], byShoe.get(`${id}|2`), draw),
      };
    });
  }
}

/** win_rate: ván hòa (result thuộc `draw`) tính là thắng; wins / losses / draws vẫn tách riêng như cũ. null khi chưa có ván nào được chấm. */
function winRate(wins: number, losses: number, draws: number): number | null {
  const total = wins + draws + losses;
  return total > 0 ? (wins + draws) / total : null;
}

/**
 * "Tỷ lệ tốt gần đây" của một stream. shoes: tỷ lệ từng shoe, mới → cũ. Hôm nay có >= RECENT_RATE_SHOES shoe ⇒ so các shoe của hôm nay;
 * ít hơn ⇒ so RECENT_RATE_SHOES shoe gần nhất (kể cả ngày trước). Trả tỷ lệ CAO NHẤT (hòa tính là thắng) trong số shoe có
 * >= RECENT_RATE_MIN_ROUNDS lượt đã chấm; null khi không shoe nào đủ lượt. Lưu ý đây là giá trị lớn nhất, không phải trung bình.
 */
function recentBestRate(shoes: { wins: number; losses: number; draws: number; today: boolean }[]): number | null {
  const today = shoes.filter((s) => s.today);
  const pool = today.length >= RECENT_RATE_SHOES ? today : shoes.slice(0, RECENT_RATE_SHOES);
  let best: number | null = null;
  for (const s of pool) {
    if (s.wins + s.losses + s.draws < RECENT_RATE_MIN_ROUNDS) continue;
    const rate = winRate(s.wins, s.losses, s.draws);
    if (rate !== null && (best === null || rate > best)) best = rate;
  }
  return best;
}

/** Chuỗi thắng dài nhất trong một shoe (dự đoán đã chấm, cũ → mới): kết quả thuộc `draw` bỏ qua, thua thì đứt chuỗi. */
function longestWinStreak(rows: { pick: string; result: string }[], draw: readonly string[]): number {
  let best = 0, run = 0;
  for (const r of rows) {
    if (draw.includes(r.result)) continue;
    run = r.pick === r.result ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Chuỗi ở danh sách bàn: chuỗi dài nhất của shoe hiện tại (N); nếu nó < LIST_STREAK_MIN hoặc N có < LIST_STREAK_MIN_ROUNDS
 * lượt đã chấm (kể cả hòa) thì lấy chuỗi dài nhất của shoe trước (N−1) NẾU nó lớn hơn (max, không thay thế: danh sách không
 * bao giờ thấp hơn chuỗi của shoe hiện tại). Chưa có shoe trước ⇒ giữ của N.
 */
function listStreak(current: { pick: string; result: string }[], previous: { pick: string; result: string }[] | undefined, draw: readonly string[]): number {
  const n = longestWinStreak(current, draw);
  if ((n < LIST_STREAK_MIN || current.length < LIST_STREAK_MIN_ROUNDS) && previous) return Math.max(n, longestWinStreak(previous, draw));
  return n;
}

/**
 * Phần thuần của slidingBestStreaks. rows: dự đoán đã chấm của một stream, cũ → mới, mỗi dòng kèm shoe. Lấy 3 shoe gần nhất rồi tìm chuỗi đúng liên tiếp dài nhất (hòa = đúng, sai = đứt).
 */
export function slidingStreak(rows: { shoe: number; pick: string; result: string }[], draw: readonly string[]): number {
  const shoes = new Set<number>();   // SLIDING_STREAK_SHOES shoe gần nhất, theo lần xuất hiện cuối của từng shoe
  for (let i = rows.length - 1; i >= 0 && (shoes.has(rows[i].shoe) || shoes.size < SLIDING_STREAK_SHOES); i--) shoes.add(rows[i].shoe);
  let best = 0, run = 0;
  for (const r of rows) {
    if (!shoes.has(r.shoe)) continue;
    run = draw.includes(r.result) || r.pick === r.result ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}
