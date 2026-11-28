// src/no-hu/lucky-time.service.ts
// Lịch lucky time (HOST): xem lịch đang hiệu lực và import. Import KHÔNG xóa: dòng cũ được đánh dấu replaced_at.
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { NO_HU_LOBBY_ID } from "@toolhackchain/shared";
import { readLuckyTimeFile } from "@toolhackchain/shared/lucky-time-file";
import { updateReturning } from "../common/update-returning.js";

/** Khóa advisory của import lịch: hai lần import cùng lúc được tuần tự hóa (không chồng replaced_at / dòng mới). */
const IMPORT_LOCK_KEY = 7_340_001;
const MAX_ISSUES_RETURNED = 200;

export type LuckyTimeItem = {
  lucky_time_id: string; category_id: string; category_name: string; time_lucky: string;
  confidence: number | null; indicator: string | null; circle_est_from: number | null; circle_est_to: number | null;
  range_lucky_time_from: number | null; range_lucky_time_to: number | null; trace_next_circle: number | null; fluctuations_rtp: number | null;
};

@Injectable()
export class LuckyTimeService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  async list(categoryId?: string): Promise<{ items: LuckyTimeItem[] }> {
    const rows: (Omit<LuckyTimeItem, "fluctuations_rtp"> & { fluctuations_rtp: string | null })[] = await this.ds.query(
      `-- top-level: SELECT
       SELECT lt.lucky_time_id, lt.category_id, c.category_name, to_char(lt.time_lucky, 'HH24:MI') AS time_lucky, lt.confidence, lt.indicator,
              lt.circle_est_from, lt.circle_est_to, lt.range_lucky_time_from, lt.range_lucky_time_to, lt.trace_next_circle,
              lt.fluctuations_rtp::text AS fluctuations_rtp
       FROM lucky_time lt JOIN categories c ON c.category_id = lt.category_id
       WHERE lt.replaced_at IS NULL AND c.lobby_id = $1 AND ($2::uuid IS NULL OR lt.category_id = $2::uuid)
       ORDER BY c.category_name, lt.time_lucky`,
      [NO_HU_LOBBY_ID, categoryId ?? null]);
    return { items: rows.map((r) => ({ ...r, fluctuations_rtp: r.fluctuations_rtp === null ? null : Number(r.fluctuations_rtp) })) };
  }

  /**
   * Đọc + kiểm tra file; mỗi dòng bắt buộc thuộc một category của lobby NỔ HŨ (cột "Tên game"). Một transaction: với MỖI category có mặt
   * trong file, đánh dấu replaced_at các dòng đang hiệu lực của nó rồi thêm dòng mới; category không có trong file giữ nguyên.
   */
  async importFile(data: Buffer): Promise<{ categories: number; rows: number; replaced: number }> {
    const cats: { category_id: string; category_name: string }[] = await this.ds.query(
      `SELECT category_id, category_name FROM categories WHERE lobby_id = $1 AND status <> 'ARCHIVE' ORDER BY category_name`, [NO_HU_LOBBY_ID]);
    const idByName = new Map(cats.map((c) => [c.category_name, c.category_id]));

    const parsed = readLuckyTimeFile(data, cats.map((c) => c.category_name));
    if (parsed.issues.length > 0 || parsed.rows.length === 0) {
      throw new BadRequestException({
        code: "IMPORT_INVALID", message: "File không hợp lệ, chưa ghi gì",
        issues: parsed.issues.slice(0, MAX_ISSUES_RETURNED), total_issues: parsed.issues.length,
      });
    }

    const byCategory = new Map<string, typeof parsed.rows>();
    for (const r of parsed.rows) {
      const id = idByName.get(r.data.game);
      if (!id) throw new Error(`import: không tìm thấy category "${r.data.game}" dù parser đã khớp`);   // không xảy ra
      (byCategory.get(id) ?? byCategory.set(id, []).get(id)!).push(r);
    }

    return this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock($1)`, [IMPORT_LOCK_KEY]);
      let replaced = 0;
      for (const [categoryId, rows] of byCategory) {
        const old = await updateReturning<{ lucky_time_id: string }>(
          m, `UPDATE lucky_time SET replaced_at = now(), updated_at = now() WHERE category_id = $1 AND replaced_at IS NULL RETURNING lucky_time_id`, [categoryId]);
        replaced += old.length;
        const d = rows.map((r) => r.data);
        await m.query(
          `INSERT INTO lucky_time (category_id, time_lucky, confidence, indicator, circle_est_from, circle_est_to,
                                   range_lucky_time_from, range_lucky_time_to, trace_next_circle, fluctuations_rtp)
           SELECT $1::uuid, t.* FROM unnest($2::time[], $3::int[], $4::text[], $5::int[], $6::int[], $7::int[], $8::int[], $9::int[], $10::numeric[])
             AS t(time_lucky, confidence, indicator, circle_est_from, circle_est_to, range_from, range_to, trace_next_circle, rtp)`,
          [categoryId, d.map((x) => x.time_lucky), d.map((x) => x.confidence), d.map((x) => x.indicator),
            d.map((x) => x.circle_est_from), d.map((x) => x.circle_est_to), d.map((x) => x.range_lucky_time_from),
            d.map((x) => x.range_lucky_time_to), d.map((x) => x.trace_next_circle), d.map((x) => x.fluctuations_rtp)]);
      }
      return { categories: byCategory.size, rows: parsed.rows.length, replaced };
    });
  }
}
