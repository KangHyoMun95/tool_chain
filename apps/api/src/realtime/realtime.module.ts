// src/realtime/realtime.module.ts
import { Module } from "@nestjs/common";
// import { AuthModule } from "../auth/auth.module.js";
import { RealtimeHub } from "./realtime.hub.js";
import { RealtimeController } from "./realtime.controller.js";
// import { StreamItemsGuard } from "./stream-items.guard.js";

@Module({
  // imports: [AuthModule],
  providers: [RealtimeHub, /*StreamItemsGuard */],
  controllers: [RealtimeController]
})
export class RealtimeModule {}