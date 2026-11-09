// src/predictions/predictions.service.ts
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import type { ChosenPattern, PredictResult, PredictionDetail, PredictionReason } from "@toolhackchain/shared";
import { GameSessionEntity, PredictionEntity } from "../database/entities/index.js";
import { GameSessionsService } from "../game-sessions/game-sessions.service.js";
import { STATS_SHOES, STATS_STREAK_WINDOW } from "./predictions.constants.js";

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
};

export type PredictionStats = {
  shoe: number | null;             // shoe hiện tại = shoe của dự đoán mới nhất của stream; null khi chưa có dự đoán nào
  wins: number;                    // các số dưới đây chỉ tính trong shoe hiện tại
  losses: number;
  draws: number;                   // kết quả T: không tính thắng / thua
  win_rate: number | null;         // wins / (wins + losses), 0–1; null khi shoe hiện tại chưa có ván nào để tính
  win_streak: number;              // số dự đoán thắng liên tiếp tính từ ván mới nhất (bỏ qua ván hòa), xét trong STATS_STREAK_WINDOW dự đoán
  shoes: {                         // tỷ lệ thắng của từng shoe trong STATS_SHOES shoe gần nhất (gồm shoe hiện tại), cũ → mới
    shoe: number; wins: number; losses: number; draws: number; win_rate: number;
  }[];
};

@Injectable()
export class PredictionsService {
  constructor(@InjectDataSource() private ds: DataSource, private sessions: GameSessionsService) {}

  /**
   * Một transaction: đảm bảo game_sessions tồn tại (khóa ngoại; ván có thể còn nằm trong batch của ingestion)
   * rồi insert prediction. Trả created_at nếu thêm dòng MỚI, null nếu ván đã có prediction (retry / trùng).
   */
  async insertFromResult(msg: PredictResult): Promise<Date | null> {
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
      return rows[0]?.created_at ?? null;
    });
  }

  /** Prediction mới nhất của stream (theo thời điểm tạo), kèm shoe/round của ván. null nếu chưa có. */
  async current(streamId: string): Promise<CurrentPrediction | null> {
    const r = await this.ds.createQueryBuilder()
      .select([
        "p.predictionId AS prediction_id", "p.gameSessionId AS game_session_id", "p.streamId AS stream_id",
        "gs.roadShoe AS shoe", "gs.roadCount AS round", "p.predictResult AS pick", "p.confidenceScore AS confidence",
        "p.detail AS detail", "p.reason AS reason", "p.modelVersion AS model_version", "p.createdAt AS created_at",
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
      [streamId, STATS_SHOES]);   // mới → cũ
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
      shoes: perShoe.filter((r) => r.win_rate !== null).reverse() as PredictionStats["shoes"],
    };
  }
}
