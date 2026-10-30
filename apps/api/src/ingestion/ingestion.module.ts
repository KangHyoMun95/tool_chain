// src/ingestion/ingestion.module.ts
import { Module } from "@nestjs/common";
import { LobbiesModule } from "../lobbies/lobbies.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { StreamsModule } from "../streams/streams.module.js";
import { StreamInformationModule } from "../stream-information/stream-information.module.js";
import { GameSessionsModule } from "../game-sessions/game-sessions.module.js";
import { IdCache } from "./id-cache.service.js";
import { IngestionService } from "./ingestion.service.js";
import { TickPersister } from "./tick-persister.service.js";

@Module({
  imports: [LobbiesModule, CategoriesModule, StreamsModule, StreamInformationModule, GameSessionsModule],
  providers: [IdCache, IngestionService, TickPersister],
})
export class IngestionModule {}
