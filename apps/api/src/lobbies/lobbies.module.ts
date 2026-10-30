// src/lobbies/lobbies.module.ts
import { Module } from "@nestjs/common";
import { LobbiesService } from "./lobbies.service.js";

@Module({ providers: [LobbiesService], exports: [LobbiesService] })
export class LobbiesModule {}
