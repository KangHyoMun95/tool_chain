// src/jobs/clear-history.job.ts
// CLEAR_HISTORY (mỗi ngày 03:00 theo TZ): xóa THEO VÁN mọi game_sessions có created_at < mốc cắt, kéo theo đúng dữ liệu của các ván đó.
// KHÔNG bỏ qua ván nào theo trạng thái (kể cả RUNNING treo và subscription "chờ hoàn"): chỉ đếm để log WARN theo dõi.
// Mỗi lô CLEAR_HISTORY_BATCH ván, trong MỘT transaction, theo thứ tự:
//   1. khóa ván (FOR UPDATE SKIP LOCKED) rồi khóa subscription của chúng (settlement cũng khóa ps trước khi ghi REFUND);
//   2. (một câu lệnh) xóa transactions CHARGE / REFUND gắn với subscription của lô VÀ ghi tổng hợp đúng những dòng vừa xóa vào
//      transaction_daily_summaries (theo user, loại, ngày CỦA CHÍNH giao dịch theo TZ): không thể xóa mà không tổng hợp;
//   3. xóa prediction_subscriptions → predictions → game_sessions.
// Lỗi ở bất kỳ bước nào ⇒ rollback cả lô, ném lỗi (job log ERROR và dừng; lần sau làm tiếp).
// TUYỆT ĐỐI không đụng transactions loại MINT, TRANSFER_OUT, TRANSFER_IN, INVOKE (câu DELETE chỉ nhận CHARGE / REFUND; nếu một giao
// dịch khác lỡ trỏ vào subscription thì khóa ngoại làm lô rollback chứ không bị xóa).
import type { Logger } from "@nestjs/common";
import type { JobDb } from "./job-db.js";
import { BATCH_PAUSE_MS, CLEAR_HISTORY_BATCH, JOB_MAX_RUN_MS } from "./jobs.constants.js";

// $1 = mốc cắt, $2 = cỡ lô. Ván cũ nhất trước.
const PICK_SESSIONS_SQL = `
  SELECT game_session_id::text AS id, status
  FROM game_sessions
  WHERE created_at < $1::timestamptz
  ORDER BY created_at
  LIMIT $2
  FOR UPDATE SKIP LOCKED`;

// $1 = id ván trong lô
const LOCK_SUBSCRIPTIONS_SQL = `
  SELECT ps.prediction_subscription_id
  FROM prediction_subscriptions ps JOIN predictions p ON p.prediction_id = ps.prediction_id
  WHERE p.game_session_id = ANY($1::uuid[])
  FOR UPDATE OF ps`;

// Subscription chưa hoàn / chưa bỏ hoàn thuộc ván thua, hủy hoặc RUNNING (chỉ để log WARN).
const COUNT_PENDING_SQL = `
  SELECT count(*)::int AS n
  FROM prediction_subscriptions ps
  JOIN predictions p ON p.prediction_id = ps.prediction_id
  JOIN game_sessions gs ON gs.game_session_id = p.game_session_id
  WHERE gs.game_session_id = ANY($1::uuid[])
    AND ps.refunded_at IS NULL AND ps.refund_waived_at IS NULL
    AND (gs.status IN ('CANCELLED', 'RUNNING') OR gs.result <> p.predict_result)`;

// $1 = id ván, $2 = múi giờ. Câu chính là INSERT (CTE chứa DELETE), tổng hợp = đúng những dòng đã xóa.
const SUMMARIZE_AND_DELETE_TX_SQL = `
  -- top-level: INSERT
  WITH del AS (
    DELETE FROM transactions t
    USING prediction_subscriptions ps, predictions p
    WHERE ps.prediction_subscription_id = t.predictions_subscriptions_id
      AND p.prediction_id = ps.prediction_id
      AND p.game_session_id = ANY($1::uuid[])
      AND t.transaction_type IN ('CHARGE', 'REFUND')
    RETURNING t.user_id, t.transaction_type, t.amount, t.created_at)
  INSERT INTO transaction_daily_summaries AS s (user_id, transaction_type, day, tx_count, total_amount)
  SELECT d.user_id, d.transaction_type, (d.created_at AT TIME ZONE $2::text)::date, count(*)::int, sum(d.amount)::bigint
  FROM del d
  GROUP BY d.user_id, d.transaction_type, (d.created_at AT TIME ZONE $2::text)::date
  ON CONFLICT (user_id, transaction_type, day) DO UPDATE
    SET tx_count = s.tx_count + EXCLUDED.tx_count,
        total_amount = s.total_amount + EXCLUDED.total_amount,
        updated_at = now()`;

// Số transactions CHARGE / REFUND đã xóa trong cùng lô (tx_count của tổng hợp cộng lại).
const COUNT_TX_SQL = `
  SELECT count(*)::int AS n
  FROM transactions t JOIN prediction_subscriptions ps ON ps.prediction_subscription_id = t.predictions_subscriptions_id
  JOIN predictions p ON p.prediction_id = ps.prediction_id
  WHERE p.game_session_id = ANY($1::uuid[]) AND t.transaction_type IN ('CHARGE', 'REFUND')`;

const DELETE_SUBSCRIPTIONS_SQL = `
  DELETE FROM prediction_subscriptions ps USING predictions p
  WHERE p.prediction_id = ps.prediction_id AND p.game_session_id = ANY($1::uuid[])`;
const DELETE_PREDICTIONS_SQL = `DELETE FROM predictions WHERE game_session_id = ANY($1::uuid[])`;
const DELETE_SESSIONS_SQL = `DELETE FROM game_sessions WHERE game_session_id = ANY($1::uuid[])`;

export type ClearHistoryStats = {
  sessions: number;
  runningSessions: number;           // ván RUNNING (treo) đã xóa
  pendingSubscriptions: number;      // subscription chưa hoàn / chưa bỏ hoàn (ván thua, hủy hoặc RUNNING) đã xóa
  subscriptions: number;
  predictions: number;
  transactions: number;
  summaryRows: number;
  batches: number;
};

export async function clearHistory(
  db: JobDb, cutoff: string, timeZone: string, log: Logger, keepAlive: () => Promise<void>, stats: ClearHistoryStats,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    const batch = await db.transaction(async (tx) => {
      const sessions = await tx.rows<{ id: string; status: string }>(PICK_SESSIONS_SQL, [cutoff, CLEAR_HISTORY_BATCH]);
      if (sessions.length === 0) return null;
      const ids = sessions.map((s) => s.id);
      await tx.rows(LOCK_SUBSCRIPTIONS_SQL, [ids]);
      const [{ n: pending }] = await tx.rows<{ n: number }>(COUNT_PENDING_SQL, [ids]);
      const [{ n: txCount }] = await tx.rows<{ n: number }>(COUNT_TX_SQL, [ids]);
      const summaryRows = await tx.exec(SUMMARIZE_AND_DELETE_TX_SQL, [ids, timeZone]);
      const subscriptions = await tx.exec(DELETE_SUBSCRIPTIONS_SQL, [ids]);
      const predictions = await tx.exec(DELETE_PREDICTIONS_SQL, [ids]);
      const deleted = await tx.exec(DELETE_SESSIONS_SQL, [ids]);
      if (deleted !== ids.length) throw new Error(`xóa ${deleted}/${ids.length} ván (có ván bị đổi giữa chừng), rollback lô`);
      return { n: ids.length, running: sessions.filter((s) => s.status === "RUNNING").length, pending, txCount, summaryRows, subscriptions, predictions };
    });
    if (!batch) break;
    // Chỉ cộng vào thống kê SAU khi transaction của lô đã commit.
    stats.sessions += batch.n;
    stats.runningSessions += batch.running;
    stats.pendingSubscriptions += batch.pending;
    stats.subscriptions += batch.subscriptions;
    stats.predictions += batch.predictions;
    stats.transactions += batch.txCount;
    stats.summaryRows += batch.summaryRows;
    stats.batches++;
    await keepAlive();
    if (Date.now() - started > JOB_MAX_RUN_MS) {
      log.warn(`CLEAR_HISTORY: quá ${JOB_MAX_RUN_MS / 60_000} phút, dừng (phần còn lại để lần sau)`);
      break;
    }
    await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
  }
}
