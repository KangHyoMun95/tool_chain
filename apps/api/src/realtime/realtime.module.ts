// src/realtime/realtime.module.ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { IngestionModule } from "../ingestion/ingestion.module.js";
import { StreamsModule } from "../streams/streams.module.js";
import { ConnectionRegistry } from "./connection-registry.js";
import { RealtimeTicketService } from "./realtime-ticket.service.js";
import { RealtimeHub } from "./realtime.hub.js";
import { RealtimeController } from "./realtime.controller.js";

@Module({
  imports: [IngestionModule, AuthModule, StreamsModule, BillingModule],   // IdCache, SessionService, quyền xem stream, kiểm tra số dư
  providers: [RealtimeHub, ConnectionRegistry, RealtimeTicketService],
  controllers: [RealtimeController],
  exports: [RealtimeHub, ConnectionRegistry],
})
export class RealtimeModule {}
