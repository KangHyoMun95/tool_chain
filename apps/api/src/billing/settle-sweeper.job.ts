// src/billing/settle-sweeper.job.ts
// Lưới an toàn: tín hiệu settle:requests có thể mất (API chết giữa commit và XADD, Redis lỗi). Mỗi phút tìm ván đã
// FINISHED / CANCELLED hơn SWEEP_MIN_AGE_MS mà còn subscription đủ điều kiện hoàn chưa hoàn, gửi lại (có chống trùng
// settle_req:{gsid} NX EX). Settlement idempotent nên gửi thừa vô hại. HAS_REFUND=false ⇒ không chạy (không có gì để gửi bù).
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { GameSessionStatus, type SettleReason } from "@toolhackchain/shared";
import { SWEEP_BATCH_LIMIT, SWEEP_INTERVAL_MS, SWEEP_LOOKBACK_DAYS, SWEEP_MIN_AGE_MS } from "./billing.constants.js";
import { BillingService } from "./billing.service.js";
import { SettleQueue } from "./settle-queue.service.js";

@Injectable()
export class SettleSweeperJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(SettleSweeperJob.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(@InjectDataSource() private ds: DataSource, private queue: SettleQueue, private billing: BillingService) {}

  onApplicationBootstrap() {
    if (!this.billing.refundEnabled) return;   // SettlementConsumer đã log WARN lúc khởi động
    this.timer = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS);
  }
  onModuleDestroy() { clearInterval(this.timer); }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      // ended_at NULL (dòng trước V10) thì dùng created_at.
      const rows: { id: string; status: SettleReason }[] = await this.ds.query(
        `SELECT DISTINCT g.game_session_id AS id, g.status
         FROM prediction_subscriptions ps
         JOIN predictions p ON p.prediction_id = ps.prediction_id
         JOIN game_sessions g ON g.game_session_id = p.game_session_id
         WHERE ps.refunded_at IS NULL AND ps.created_at > now() - make_interval(days => $1)
           AND COALESCE(g.ended_at, g.created_at) < now() - make_interval(secs => $2)
           AND (g.status = $3 OR (g.status = $4 AND g.result IS NOT NULL AND g.result <> p.predict_result))
         LIMIT $5`,
        [SWEEP_LOOKBACK_DAYS, SWEEP_MIN_AGE_MS / 1000, GameSessionStatus.CANCELLED, GameSessionStatus.FINISHED, SWEEP_BATCH_LIMIT]);
      if (rows.length === 0) return;
      const sent = await this.queue.enqueueDeduped(rows.map((r) => ({ id: r.id, reason: r.status })));
      // Bình thường settlement xử lý ngay nên không có gì để quét: thấy dòng này nghĩa là có tín hiệu bị mất / settlement đang lỗi.
      if (sent > 0) this.log.warn(`Sweeper gửi lại settle:requests cho ${sent}/${rows.length} ván còn tiền chưa hoàn`);
    } catch (e) {
      this.log.error(e);
    } finally {
      this.busy = false;
    }
  }
}
