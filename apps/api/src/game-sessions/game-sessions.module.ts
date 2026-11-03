// src/game-sessions/game-sessions.module.ts
import { Module } from "@nestjs/common";
import { StreamsModule } from "../streams/streams.module.js";
import { GameSessionsController } from "./game-sessions.controller.js";
import { GameSessionsService } from "./game-sessions.service.js";

@Module({
  imports: [StreamsModule],
  controllers: [GameSessionsController],
  providers: [GameSessionsService],
  exports: [GameSessionsService],
})
export class GameSessionsModule {}
