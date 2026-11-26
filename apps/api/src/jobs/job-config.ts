// src/jobs/job-config.ts
// Đọc cấu hình job (bảng job_configs) ở MỖI lần chạy và đổi (value, unit) thành mốc cắt (timestamptz).
//   unit 'day'  ⇒ 0h (theo múi giờ của process) của ngày (hôm nay − value)
//   unit 'hour' / 'minute' ⇒ now() − value giờ / phút
// value NULL ⇒ bỏ qua (DEBUG). unit lạ, value ≤ 0 hoặc không phải số nguyên ⇒ WARN và bỏ qua lần chạy.
import type { Logger } from "@nestjs/common";
import type { JobDb } from "./job-db.js";
import { JOB_UNITS, type JobType, type JobUnit } from "./jobs.constants.js";

const isUnit = (u: unknown): u is JobUnit => (JOB_UNITS as readonly unknown[]).includes(u);

/** Mốc cắt dạng chuỗi timestamptz (giữ nguyên độ chính xác khi truyền lại làm tham số), hoặc null nếu bỏ qua lần chạy. */
export async function resolveCutoff(db: JobDb, type: JobType, timeZone: string, log: Logger): Promise<string | null> {
  const [cfg] = await db.rows<{ value: number | null; unit: string }>("SELECT value, unit FROM job_configs WHERE type = $1", [type]);
  if (!cfg) {
    log.warn(`${type}: không có dòng cấu hình trong job_configs, bỏ qua`);
    return null;
  }
  if (cfg.value === null) {
    log.debug(`${type}: value NULL (tắt), bỏ qua`);
    return null;
  }
  if (!Number.isInteger(cfg.value) || cfg.value <= 0 || !isUnit(cfg.unit)) {
    log.warn(`${type}: cấu hình sai (value=${cfg.value}, unit=${cfg.unit}): value phải là số nguyên > 0, unit thuộc ${JOB_UNITS.join(" | ")}. Bỏ qua lần chạy này`);
    return null;
  }
  const [row] = cfg.unit === "day"
    ? await db.rows<{ cutoff: string }>(
        `SELECT ((date_trunc('day', now() AT TIME ZONE $1::text) - make_interval(days => $2::int)) AT TIME ZONE $1::text)::text AS cutoff`,
        [timeZone, cfg.value])
    : await db.rows<{ cutoff: string }>(
        cfg.unit === "hour"
          ? `SELECT (now() - make_interval(hours => $1::int))::text AS cutoff`
          : `SELECT (now() - make_interval(mins => $1::int))::text AS cutoff`,
        [cfg.value]);
  return row.cutoff;
}
