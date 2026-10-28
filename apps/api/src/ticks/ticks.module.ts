// src/ticks/ticks.module.ts
import { Module } from "@nestjs/common";
// import { TypeOrmModule } from "@nestjs/typeorm";
// import { TickEntity } from "./tick.entity.js";
import { TickPersister } from "./tick-persister.service.js";

@Module({
  // imports: [TypeOrmModule.forFeature([TickEntity])],
  providers: [TickPersister]
})
export class TicksModule {}