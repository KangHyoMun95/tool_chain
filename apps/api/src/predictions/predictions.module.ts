// src/predictions/predictions.module.ts
import { Module } from "@nestjs/common";
import { GameSessionsModule } from "../game-sessions/game-sessions.module.js";
import { IngestionModule } from "../ingestion/ingestion.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { StreamsModule } from "../streams/streams.module.js";
import { PredictResultConsumer } from "./predict-result.consumer.js";
import { PredictTriggerService } from "./predict-trigger.service.js";
import { PredictionsController } from "./predictions.controller.js";
import { PredictionsService } from "./predictions.service.js";

@Module({
  imports: [IngestionModule, GameSessionsModule, StreamsModule, RealtimeModule],   // IdCache, insertMany, quyền xem stream, RealtimeHub
  controllers: [PredictionsController],
  providers: [PredictTriggerService, PredictResultConsumer, PredictionsService],
})
export class PredictionsModule {}
