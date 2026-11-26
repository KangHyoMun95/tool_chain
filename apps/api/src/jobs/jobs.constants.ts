// src/jobs/jobs.constants.ts
import { STATS_SHOES } from "../predictions/predictions.constants.js";

export const JOB_TYPES = ["CLEAR_PREDICT_UNUSE", "CLEAR_HISTORY"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_UNITS = ["minute", "hour", "day"] as const;
export type JobUnit = (typeof JOB_UNITS)[number];

export const CLEAR_HISTORY_HOUR = 3;                  // 03:00 theo TZ của process, mỗi ngày
export const SCHEDULER_TICK_MS = 20_000;              // < 60s để chắc chắn gặp phút :00
export const CLEAR_HISTORY_BATCH = 500;               // ván / lô (mỗi lô một transaction)
export const CLEAR_PREDICT_BATCH = 1_000;             // prediction / lô
export const BATCH_PAUSE_MS = 200;                    // nghỉ giữa hai lô cho ingestion / settlement chen vào
export const JOB_MAX_RUN_MS = 30 * 60_000;            // một lần chạy tối đa; phần còn lại để lần sau
export const JOB_LOCK_TTL_S = 15 * 60;                // khóa chống chạy chồng; gia hạn sau mỗi lô
export const JOB_FIRED_TTL_S = 2 * 3600;              // dấu "đã kích hoạt trong giờ / ngày này" (chống kích hoạt trùng)

// Số shoe của mỗi stream được CLEAR_PREDICT_UNUSE giữ lại = shoe hiện tại + STATS_SHOES shoe quá khứ của biểu đồ
// "Tỷ lệ win theo phiên" (dùng chung hằng số STATS_SHOES với predictions.service.ts nên biểu đồ không bị đổi).
export const PROTECTED_SHOES = STATS_SHOES + 1;

export const redisJobLock = (type: JobType) => `job:lock:${type}`;
export const redisJobFired = (type: JobType, slot: string) => `job:fired:${type}:${slot}`;
