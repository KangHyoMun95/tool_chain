// src/streams/streams.controller.ts
import { Controller, Get, Param, Query } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators.js";
import { BillingService } from "../billing/billing.service.js";
import { IdParamDto } from "../common/catalog-list.js";
import { StreamListQueryDto } from "./dto/stream-list-query.dto.js";
import { StreamsService } from "./streams.service.js";

// Chỉ đọc: tạo stream nằm ở luồng ingestion. Mọi role đã đăng nhập đều xem được.
@Controller("streams")
export class StreamsController {
  constructor(private streams: StreamsService, private billing: BillingService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: StreamListQueryDto) {
    return this.streams.list(actor.role, query);
  }

  /** Trang chi tiết = tự tham gia (bị trừ tiền): USER không đủ điểm ⇒ 402 INSUFFICIENT_BALANCE (sau kiểm tra 404). */
  @Get(":id")
  async getOne(@CurrentUser() actor: AuthUser, @Param() params: IdParamDto) {
    const stream = await this.streams.getOne(actor.role, params.id);
    if (actor.role === "USER") await this.billing.assertCanParticipate(actor.userId);
    return stream;
  }
}
