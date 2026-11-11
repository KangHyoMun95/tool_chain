// src/billing/game-session-cancel.job.ts
// Mỗi phút: ván RUNNING chưa có result quá GAME_SESSION_CANCEL_AFTER_MINUTES phút → CANCELLED, rồi gửi settle:requests
// (chỉ cho ván có subscription chưa hoàn) để hoàn toàn bộ. Chỉ chạy khi GAME_SESSION_CANCEL_ENABLED=true.
// Ingestion bỏ qua result đến sau CANCELLED (applyResults: status <> 'CANCELLED').
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { GameSessionStatus } from "@toolhackchain/shared";
import { updateReturning } from "../common/update-returning.js";
import type { EnvVars } from "../config/env.validation.js";
import { CANCEL_BATCH_LIMIT, CANCEL_JOB_INTERVAL_MS } from "./billing.constants.js";
import { SettleQueue } from "./settle-queue.service.js";

@Injectable()
export class GameSessionCancelJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(GameSessionCancelJob.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    @InjectDataSource() private ds: DataSource,
    private queue: SettleQueue,
    private config: ConfigService<EnvVars, true>,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get("GAME_SESSION_CANCEL_ENABLED", { infer: true }) !== "true") {
      this.log.warn("Job hủy ván đang TẮT (GAME_SESSION_CANCEL_ENABLED != true): ván không có result sẽ không bị CANCELLED / hoàn tiền");
      return;
    }
    this.timer = setInterval(() => void this.tick(), CANCEL_JOB_INTERVAL_MS);
  }

  onModuleDestroy() { clearInterval(this.timer); }

  private async tick() {
    if (this.busy) return;   // lần trước chưa xong thì bỏ lượt này
    this.busy = true;
    try {
      const minutes = this.config.get("GAME_SESSION_CANCEL_AFTER_MINUTES", { infer: true });
      // SKIP LOCKED: bỏ qua ván đang bị khóa (charge FOR SHARE / ingestion đang ghi result); lượt sau xét lại.
      // Một câu lệnh (auto-commit): chỉ gửi settle:requests sau khi đã commit.
      const rows = await updateReturning<{ id: string; has_subs: boolean }>(
        this.ds,
        `WITH c AS (
           SELECT game_session_id FROM game_sessions
           WHERE status = $1 AND result IS NULL AND created_at < now() - make_interval(mins => $2)
           ORDER BY created_at LIMIT $3
           FOR UPDATE SKIP LOCKED)
         UPDATE game_sessions g SET status = $4, ended_at = now()
         FROM c WHERE g.game_session_id = c.game_session_id
         RETURNING g.game_session_id AS id,
           EXISTS (SELECT 1 FROM predictions p JOIN prediction_subscriptions ps ON ps.prediction_id = p.prediction_id
                   WHERE p.game_session_id = g.game_session_id AND ps.refunded_at IS NULL) AS has_subs`,
        [GameSessionStatus.RUNNING, minutes, CANCEL_BATCH_LIMIT, GameSessionStatus.CANCELLED]);
      if (rows.length === 0) return;
      const toSettle = rows.filter((r) => r.has_subs).map((r) => r.id);
      this.log.log(`CANCELLED ${rows.length} ván không có result quá ${minutes} phút (${toSettle.length} ván cần hoàn tiền)`);
      // Lỗi Redis ở đây: sweeper sẽ gửi lại sau SWEEP_MIN_AGE_MS.
      const sent = await this.queue.enqueue(toSettle, "CANCELLED");
      if (sent !== toSettle.length) this.log.error(`Chỉ gửi được ${sent}/${toSettle.length} settle:requests CANCELLED (sweeper sẽ gửi bù)`);
    } catch (e) {
      this.log.error(e);
    } finally {
      this.busy = false;
    }
  }
}
