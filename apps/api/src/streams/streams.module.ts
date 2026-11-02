// src/streams/streams.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StreamEntity } from "../database/entities/index.js";
import { StreamsController } from "./streams.controller.js";
import { StreamsService } from "./streams.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([StreamEntity])],
  controllers: [StreamsController],
  providers: [StreamsService],
  exports: [StreamsService],
})
export class StreamsModule {}
