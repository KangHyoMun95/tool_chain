// src/jobs/clear-predict-unuse.job.ts
// CLEAR_PREDICT_UNUSE (mỗi giờ): xóa prediction (CÓ hoặc KHÔNG có pick) thỏa TẤT CẢ:
//   - không có prediction_subscriptions nào;
//   - ván FINISHED hoặc CANCELLED;
//   - predictions.created_at < mốc cắt (job_configs: value + unit, mặc định 2 giờ);
//   - không thuộc PROTECTED_SHOES shoe gần nhất của stream đó (shoe hiện tại + STATS_SHOES shoe của biểu đồ "Tỷ lệ win theo phiên",
//     xếp cùng cách với PredictionsService.stats(): theo prediction có pick đã chấm mới nhất của shoe; thêm shoe của prediction mới nhất).
// Xóa theo lô, mỗi lô một câu lệnh. Chỉ đụng bảng predictions (ván và subscription giữ nguyên).
import type { Logger } from "@nestjs/common";
import type { JobDb } from "./job-db.js";
import { BATCH_PAUSE_MS, CLEAR_PREDICT_BATCH, JOB_MAX_RUN_MS, PROTECTED_SHOES } from "./jobs.constants.js";

// $1 = số shoe giữ lại (xếp hạng như biểu đồ)
const PROTECTED_SQL = `
  WITH ranked AS (
    SELECT p.stream_id, gs.road_shoe AS shoe,
           row_number() OVER (PARTITION BY p.stream_id ORDER BY max(p.created_at) DESC) AS rn
    FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
    WHERE p.predict_result IS NOT NULL AND gs.status = 'FINISHED' AND gs.result IS NOT NULL
    GROUP BY p.stream_id, gs.road_shoe)
  SELECT stream_id::text AS stream_id, shoe::int AS shoe FROM ranked WHERE rn <= $1
  UNION
  (SELECT DISTINCT ON (p.stream_id) p.stream_id::text, gs.road_shoe::int
   FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
   ORDER BY p.stream_id, p.created_at DESC)`;

// $1 = mốc cắt, $2 / $3 = cặp (stream_id, shoe) được giữ, $4 = cỡ lô
const DELETE_BATCH_SQL = `
  WITH cand AS (
    SELECT p.prediction_id
    FROM predictions p JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
    WHERE p.created_at < $1::timestamptz
      AND gs.status IN ('FINISHED', 'CANCELLED')
      AND NOT EXISTS (SELECT 1 FROM prediction_subscriptions ps WHERE ps.prediction_id = p.prediction_id)
      AND NOT EXISTS (SELECT 1 FROM unnest($2::uuid[], $3::int[]) AS k(stream_id, shoe)
                      WHERE k.stream_id = p.stream_id AND k.shoe = gs.road_shoe)
    ORDER BY p.created_at
    LIMIT $4
    FOR UPDATE OF p SKIP LOCKED)
  DELETE FROM predictions WHERE prediction_id IN (SELECT prediction_id FROM cand)`;

export type ClearPredictStats = { predictions: number; batches: number; protectedPairs: number };

export async function clearPredictUnuse(db: JobDb, cutoff: string, log: Logger, keepAlive: () => Promise<void>): Promise<ClearPredictStats> {
  const started = Date.now();
  const pairs = await db.rows<{ stream_id: string; shoe: number }>(PROTECTED_SQL, [PROTECTED_SHOES]);
  const streamIds = pairs.map((p) => p.stream_id);
  const shoes = pairs.map((p) => p.shoe);
  const stats: ClearPredictStats = { predictions: 0, batches: 0, protectedPairs: pairs.length };

  for (;;) {
    const n = await db.exec(DELETE_BATCH_SQL, [cutoff, streamIds, shoes, CLEAR_PREDICT_BATCH]);
    if (n === 0) break;
    stats.predictions += n;
    stats.batches++;
    await keepAlive();
    if (n < CLEAR_PREDICT_BATCH) break;
    if (Date.now() - started > JOB_MAX_RUN_MS) {
      log.warn(`CLEAR_PREDICT_UNUSE: quá ${JOB_MAX_RUN_MS / 60_000} phút, dừng (phần còn lại để lần sau)`);
      break;
    }
    await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
  }
  return stats;
}
