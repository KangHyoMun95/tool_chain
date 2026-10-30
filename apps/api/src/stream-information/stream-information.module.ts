// src/stream-information/stream-information.module.ts
import { Module } from "@nestjs/common";
import { StreamInformationService } from "./stream-information.service.js";

@Module({ providers: [StreamInformationService], exports: [StreamInformationService] })
export class StreamInformationModule {}
