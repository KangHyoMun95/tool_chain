// src/no-hu/no-hu.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { UnlockLuckyDto } from "./dto/unlock-lucky.dto.js";
import { NoHuService } from "./no-hu.service.js";

// Lobby NỔ HŨ phía USER. Lịch (list / import) của HOST nằm ở LuckyTimeController (PR B).
@Controller("no-hu/categories")
export class NoHuController {
  constructor(private noHu: NoHuService) {}

  /** Khung giờ hiện tại + countdown + lịch sử confidence; `details` chỉ có khi user đã trả phí cho khung này. */
  @Get(":categoryId/current")
  @Roles("USER")
  current(@CurrentUser() actor: AuthUser, @Param("categoryId", ParseUUIDPipe) categoryId: string) {
    return this.noHu.current(actor.userId, categoryId);
  }

  /** "Bắt đầu phân tích": trừ PREDICTION_FEE (không hoàn) rồi trả details. Đã trả cho khung này ⇒ miễn phí. */
  @Post(":categoryId/unlock")
  @Roles("USER")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  unlock(@CurrentUser() actor: AuthUser, @Param("categoryId", ParseUUIDPipe) categoryId: string, @Body() dto: UnlockLuckyDto) {
    return this.noHu.unlock(actor.userId, categoryId, dto.lucky_time_id);
  }
}
