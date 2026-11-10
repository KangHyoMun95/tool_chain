// src/billing/billing.module.ts
import { Module } from "@nestjs/common";
import { BillingService } from "./billing.service.js";
import { GameSessionCancelJob } from "./game-session-cancel.job.js";
import { SettleQueue } from "./settle-queue.service.js";
import { SettleSweeperJob } from "./settle-sweeper.job.js";
import { SettlementConsumer } from "./settlement.consumer.js";

@Module({
  providers: [BillingService, SettleQueue, SettlementConsumer, GameSessionCancelJob, SettleSweeperJob],
  exports: [BillingService, SettleQueue],
})
export class BillingModule {}
