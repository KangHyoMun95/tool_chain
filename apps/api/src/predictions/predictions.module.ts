// src/predictions/predictions.module.ts
import { Module } from "@nestjs/common";
import { IngestionModule } from "../ingestion/ingestion.module.js";
import { PredictTriggerService } from "./predict-trigger.service.js";

@Module({
  imports: [IngestionModule],   // IdCache (key_id → stream_id)
  providers: [PredictTriggerService],
})
export class PredictionsModule {}
