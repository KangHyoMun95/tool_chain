// src/streams/streams.module.ts
import { Module } from "@nestjs/common";
import { StreamsService } from "./streams.service.js";

@Module({ providers: [StreamsService], exports: [StreamsService] })
export class StreamsModule {}
