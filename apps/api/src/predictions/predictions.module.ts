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
import { PredictionDeliveryService } from "./prediction-delivery.service.js";

@Module({
  imports: [IngestionModule, GameSessionsModule, StreamsModule, CategoriesModule, RealtimeModule, BillingModule],   // BillingService (trừ tiền); IdCache, insertMany, quyền xem stream, ConnectionRegistry (participant + giao pick)
  controllers: [PredictionsController, CategoryStreamStatsController],
  providers: [PredictTriggerService, PredictResultConsumer, PredictionsService, PredictionDeliveryService],
})
export class PredictionsModule {}
