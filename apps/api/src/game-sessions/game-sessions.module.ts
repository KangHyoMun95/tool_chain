// src/game-sessions/game-sessions.module.ts
import { Module } from "@nestjs/common";
import { GameSessionsService } from "./game-sessions.service.js";

@Module({ providers: [GameSessionsService], exports: [GameSessionsService] })
export class GameSessionsModule {}
