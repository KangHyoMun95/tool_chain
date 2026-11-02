// src/lobbies/lobbies.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LobbyEntity } from "../database/entities/index.js";
import { LobbiesController } from "./lobbies.controller.js";
import { LobbiesService } from "./lobbies.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([LobbyEntity])],
  controllers: [LobbiesController],
  providers: [LobbiesService],
  exports: [LobbiesService],
})
export class LobbiesModule {}
