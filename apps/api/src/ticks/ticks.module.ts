// src/ticks/ticks.module.ts
import { Module } from "@nestjs/common";
import { TickPersister } from "./tick-persister.service.js";

@Module({
  providers: [TickPersister]
})
export class TicksModule {}