// src/jobs/job-runner.ts
// Lõi chạy job dùng chung cho job tự động (JobsScheduler trong API) và CLI `run-job`: đọc cấu hình, khóa chống chạy chồng,
// chạy, log kết quả, phát tín hiệu dựng lại bảng đếm cho AI. Không phụ thuộc Nest DI (CLI tự dựng DB + Redis).
import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { AI_REBUILD_CHANNEL, type AiRebuildSignal } from "@toolhackchain/shared";
import { appTimeZone } from "../common/timezone.js";
import { clearHistory, type ClearHistoryStats } from "./clear-history.job.js";
import { clearPredictUnuse } from "./clear-predict-unuse.job.js";
import { resolveCutoff } from "./job-config.js";
import type { JobDb } from "./job-db.js";
import { JOB_LOCK_TTL_S, redisJobLock, type JobType } from "./jobs.constants.js";

export type JobOutcome = "done" | "skipped" | "busy" | "failed";

const RELEASE_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`;
const EXTEND_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) end return 0`;

export class JobRunner {
  private readonly log = new Logger("Jobs");

  constructor(private readonly db: JobDb, private readonly redis: Redis) {}

  async run(type: JobType): Promise<JobOutcome> {
    const token = randomUUID();
    const lockKey = redisJobLock(type);
    // Khóa chống chạy chồng (SET NX EX); gia hạn sau mỗi lô, nhả khi xong. Treo giữa chừng thì tự hết hạn.
    if ((await this.redis.set(lockKey, token, "EX", JOB_LOCK_TTL_S, "NX")) !== "OK") {
      this.log.warn(`${type}: đang có lần chạy khác (khóa ${lockKey}), bỏ qua`);
      return "busy";
    }
    const keepAlive = async () => { await this.redis.eval(EXTEND_LUA, 1, lockKey, token, String(JOB_LOCK_TTL_S)); };
    const started = Date.now();
    const timeZone = appTimeZone();
    try {
      const cutoff = await resolveCutoff(this.db, type, timeZone, this.log);   // NULL / sai cấu hình ⇒ đã log, bỏ qua
      if (cutoff === null) return "skipped";
      this.log.log(`${type}: bắt đầu, mốc cắt ${cutoff} (TZ ${timeZone})`);

      if (type === "CLEAR_PREDICT_UNUSE") {
        const s = await clearPredictUnuse(this.db, cutoff, this.log, keepAlive);
        this.log.log(`CLEAR_PREDICT_UNUSE: đã xóa ${s.predictions} prediction (${s.batches} lô, giữ ${s.protectedPairs} cặp stream/shoe) trong ${Date.now() - started}ms`);
        return "done";
      }

      const stats: ClearHistoryStats = {
        sessions: 0, runningSessions: 0, pendingSubscriptions: 0, subscriptions: 0, predictions: 0, transactions: 0, summaryRows: 0, batches: 0,
      };
      try {
        await clearHistory(this.db, cutoff, timeZone, this.log, keepAlive, stats);
      } finally {
        // Tổng kết cả khi lỗi giữa chừng (các lô đã commit vẫn tính).
        this.reportHistory(stats, Date.now() - started);
        if (stats.sessions > 0) await this.publishRebuild(type);
      }
      return "done";
    } catch (e) {
      this.log.error(`${type}: lỗi, dừng job (lô đang chạy đã rollback, lần sau làm tiếp)`, e instanceof Error ? e.stack : String(e));
      return "failed";
    } finally {
      await this.redis.eval(RELEASE_LUA, 1, lockKey, token).catch(() => undefined);
    }
  }

  private reportHistory(s: ClearHistoryStats, ms: number) {
    if (s.sessions === 0) {
      this.log.log(`CLEAR_HISTORY: không có ván nào cần xóa (${ms}ms)`);
      return;
    }
    this.log.log(`CLEAR_HISTORY: đã xóa ${s.sessions} ván, ${s.predictions} prediction, ${s.subscriptions} subscription, ${s.transactions} transaction CHARGE/REFUND; `
      + `ghi ${s.summaryRows} dòng tổng hợp (${s.batches} lô, ${ms}ms)`);
    // Chỉ để theo dõi, KHÔNG chặn việc xóa.
    this.log.warn(`CLEAR_HISTORY: đã xóa ${s.runningSessions} ván RUNNING (treo) và ${s.pendingSubscriptions} subscription chưa được hoàn tiền `
      + `(refunded_at IS NULL, refund_waived_at IS NULL, thuộc ván thua / hủy / RUNNING)`);
  }

  /** Sau khi xóa ít nhất một ván: báo AI dựng lại bảng đếm. Lỗi Redis chỉ log (AI vẫn dựng lại từ DB khi khởi động). */
  private async publishRebuild(reason: JobType) {
    const signal: AiRebuildSignal = { schema_version: 1, reason, sent_at: new Date().toISOString() };
    try {
      const receivers = await this.redis.publish(AI_REBUILD_CHANNEL, JSON.stringify(signal));
      this.log.log(`Đã phát ${AI_REBUILD_CHANNEL} (${receivers} AI đang nghe)`);
    } catch (e) {
      this.log.error(`Không phát được ${AI_REBUILD_CHANNEL}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
