// src/no-hu/no-hu.service.ts
// Lobby NỔ HŨ phía USER. "Ván" = một dòng lucky_time. Dòng hiện tại = dòng có time_lucky GẦN NHẤT TRƯỚC giờ hiện tại (theo TZ hệ thống,
// quay vòng qua nửa đêm); dòng kế sau nó (cũng quay vòng) là đích của countdown.
// Chi tiết (details) của khung hiện tại CHỈ trả khi user đã trả phí cho (category, time_lucky, lucky_date); history chỉ có confidence.
import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { NO_HU_GAMES, NO_HU_LOBBY_ID, validateNoHuGames } from "@toolhackchain/shared";
import { BillingService } from "../billing/billing.service.js";
import { appTimeZone } from "../common/timezone.js";

export const HISTORY_ROWS = 15;

export type LuckyDetails = {
  confidence: number; indicator: string | null;
  circle_from: number | null; circle_to: number | null;
  range_from: number | null; range_to: number | null;
  trace_next_circle: number | null; rtp: number | null;
};
export type LuckyWindow = {
  schedule_empty: boolean;
  lucky_time_id: string | null;
  time_lucky: string | null;      // "HH:MM"
  next_at: number | null;         // epoch ms của dòng kế tiếp
  server_time: number;            // epoch ms của server, để countdown không lệch đồng hồ máy khách
  history: number[];              // confidence của các dòng đứng trước dòng hiện tại (cũ → mới), không gồm dòng hiện tại
  details: LuckyDetails | null;   // null = user chưa trả phí cho khung này
};

type Row = {
  lucky_time_id: string; time_lucky: string; confidence: number | null; indicator: string | null;
  circle_est_from: number | null; circle_est_to: number | null;
  range_lucky_time_from: number | null; range_lucky_time_to: number | null;
  trace_next_circle: number | null; fluctuations_rtp: string | null;
};
type Located = { rows: Row[]; cur: number; nextAt: number; luckyDate: string; serverTime: number } | null;

const hhmm = (t: string) => t.slice(0, 5);

@Injectable()
export class NoHuService implements OnModuleInit {
  private readonly log = new Logger(NoHuService.name);

  constructor(@InjectDataSource() private ds: DataSource, private billing: BillingService) {}

  /** Bảng game (NO_HU_GAMES) sai / trùng tên ⇒ API KHÔNG khởi động. Category trong DB không có trong bảng ⇒ chỉ log WARN (portal hiển thị MÃ). */
  async onModuleInit(): Promise<void> {
    const errors = validateNoHuGames();
    if (errors.length > 0) throw new Error(`NO_HU_GAMES không hợp lệ:\n  ${errors.join("\n  ")}`);
    try {
      const rows: { category_name: string }[] = await this.ds.query(`SELECT category_name FROM categories WHERE lobby_id = $1`, [NO_HU_LOBBY_ID]);
      for (const r of rows) {
        if (!Object.hasOwn(NO_HU_GAMES, r.category_name)) {
          this.log.warn(`Category "${r.category_name}" của lobby NỔ HŨ không có trong NO_HU_GAMES: hiển thị MÃ, dùng ảnh mặc định`);
        }
      }
    } catch (e) {
      this.log.warn(`Không kiểm tra được category của lobby NỔ HŨ: ${(e as Error).message}`);
    }
  }

  /** Category phải thuộc lobby NỔ HŨ và ACTIVE (cả lobby); ngoài phạm vi ⇒ 404. */
  private async assertCategory(categoryId: string): Promise<void> {
    const r: unknown[] = await this.ds.query(
      `SELECT 1 FROM categories c JOIN lobbies l ON l.lobby_id = c.lobby_id
       WHERE c.category_id = $1 AND c.lobby_id = $2 AND c.status = 'ACTIVE' AND l.status = 'ACTIVE'`,
      [categoryId, NO_HU_LOBBY_ID]);
    if (r.length === 0) throw new NotFoundException();
  }

  /** Lịch đang hiệu lực + dòng hiện tại / kế tiếp. null = category chưa có lịch. */
  private async locate(categoryId: string): Promise<Located> {
    const rows: Row[] = await this.ds.query(
      `SELECT lucky_time_id, to_char(time_lucky, 'HH24:MI:SS') AS time_lucky, confidence, indicator, circle_est_from, circle_est_to,
              range_lucky_time_from, range_lucky_time_to, trace_next_circle, fluctuations_rtp::text AS fluctuations_rtp
       FROM lucky_time WHERE category_id = $1 AND replaced_at IS NULL ORDER BY time_lucky`,
      [categoryId]);
    if (rows.length === 0) return null;

    const tz = appTimeZone();
    const [now]: { d: string; t: string }[] = await this.ds.query(
      `SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS d, to_char(now() AT TIME ZONE $1, 'HH24:MI:SS') AS t`, [tz]);

    let cur = -1;
    for (let i = 0; i < rows.length; i++) if (rows[i].time_lucky <= now.t) cur = i;
    const beforeFirst = cur < 0;   // trước dòng đầu của ngày ⇒ dòng hiện tại là dòng cuối của HÔM QUA
    if (beforeFirst) cur = rows.length - 1;
    const next = (cur + 1) % rows.length;
    // Ngày (so với hôm nay) của lần xảy ra hiện tại và của dòng kế tiếp.
    const curDayOffset = beforeFirst ? -1 : 0;
    const nextDayOffset = beforeFirst ? 0 : next > cur ? 0 : 1;

    const [r]: { next_at: string; lucky_date: string; server_time: string }[] = await this.ds.query(
      `SELECT (extract(epoch FROM (($1::date + $2::int) + $3::time) AT TIME ZONE $4) * 1000)::bigint::text AS next_at,
              to_char($1::date + $5::int, 'YYYY-MM-DD') AS lucky_date,
              (extract(epoch FROM now()) * 1000)::bigint::text AS server_time`,
      [now.d, nextDayOffset, rows[next].time_lucky, tz, curDayOffset]);
    return { rows, cur, nextAt: Number(r.next_at), luckyDate: r.lucky_date, serverTime: Number(r.server_time) };
  }

  private toDetails(r: Row): LuckyDetails {
    return {
      confidence: r.confidence ?? 0, indicator: r.indicator,
      circle_from: r.circle_est_from, circle_to: r.circle_est_to,
      range_from: r.range_lucky_time_from, range_to: r.range_lucky_time_to,
      trace_next_circle: r.trace_next_circle, rtp: r.fluctuations_rtp === null ? null : Number(r.fluctuations_rtp),
    };
  }

  async current(userId: string, categoryId: string): Promise<LuckyWindow> {
    await this.assertCategory(categoryId);
    const loc = await this.locate(categoryId);
    if (!loc) {
      return { schedule_empty: true, lucky_time_id: null, time_lucky: null, next_at: null, server_time: Date.now(), history: [], details: null };
    }
    const { rows, cur } = loc;
    const row = rows[cur];
    const history: number[] = [];
    for (let k = Math.min(HISTORY_ROWS, rows.length - 1); k >= 1; k--) history.push(rows[(cur - k + rows.length) % rows.length].confidence ?? 0);

    const paid: unknown[] = await this.ds.query(
      `SELECT 1 FROM prediction_user_lucky WHERE user_id = $1 AND category_id = $2 AND time_lucky = $3::time AND lucky_date = $4::date`,
      [userId, categoryId, row.time_lucky, loc.luckyDate]);
    return {
      schedule_empty: false, lucky_time_id: row.lucky_time_id, time_lucky: hhmm(row.time_lucky), next_at: loc.nextAt,
      server_time: loc.serverTime, history, details: paid.length > 0 ? this.toDetails(row) : null,
    };
  }

  async unlock(userId: string, categoryId: string, luckyTimeId: string): Promise<LuckyDetails> {
    await this.assertCategory(categoryId);
    const loc = await this.locate(categoryId);
    if (!loc) throw new NotFoundException();
    const row = loc.rows[loc.cur];
    // Client đang giữ dòng cũ (sang khung mới, hoặc HOST vừa import lại): báo để portal tải lại.
    if (row.lucky_time_id !== luckyTimeId) throw new ConflictException({ code: "STALE_LUCKY_TIME", message: "Lucky time đã đổi, tải lại" });
    await this.billing.chargeLucky({ userId, categoryId, luckyTimeId: row.lucky_time_id, timeLucky: row.time_lucky, luckyDate: loc.luckyDate });
    return this.toDetails(row);
  }
}
