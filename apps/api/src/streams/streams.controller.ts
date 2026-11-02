// src/streams/streams.controller.ts
import { Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators.js";
import { StreamListQueryDto } from "./dto/stream-list-query.dto.js";
import { StreamsService } from "./streams.service.js";

// Chỉ đọc: tạo stream nằm ở luồng ingestion. Mọi role đã đăng nhập đều xem được.
@Controller("streams")
export class StreamsController {
  constructor(private streams: StreamsService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: StreamListQueryDto) {
    return this.streams.list(actor.role, query);
  }
}
