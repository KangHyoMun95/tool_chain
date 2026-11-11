// src/predictions/predictions.module.ts
import { Module } from "@nestjs/common";
import { GameSessionsModule } from "../game-sessions/game-sessions.module.js";
import { IngestionModule } from "../ingestion/ingestion.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { StreamsModule } from "../streams/streams.module.js";
import { PredictResultConsumer } from "./predict-result.consumer.js";
import { PredictTriggerService } from "./predict-trigger.service.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { CategoryStreamStatsController, PredictionsController } from "./predictions.controller.js";
import { PredictionsService } from "./predictions.service.js";
import { BillingModule } from "../billing/billing.module.js";
import { noParticipants, PARTICIPANT_SOURCE } from "../billing/participant-source.js";

@Module({
  imports: [IngestionModule, GameSessionsModule, StreamsModule, CategoriesModule, RealtimeModule, BillingModule],   // BillingService (trừ tiền); IdCache, insertMany, quyền xem stream, RealtimeHub
  controllers: [PredictionsController, CategoryStreamStatsController],
  providers: [
    PredictTriggerService, PredictResultConsumer, PredictionsService,
    // TODO(billing PR2): thay bằng connection registry của RealtimeHub. Hiện chưa có kết nối tham gia nên không ai bị trừ tiền.
    { provide: PARTICIPANT_SOURCE, useValue: noParticipants },
  ],
})
export class PredictionsModule {}
