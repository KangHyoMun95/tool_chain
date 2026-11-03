// src/game-sessions/game-sessions.controller.ts
import { Controller, Get, Param, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthUser } from "../auth/auth.types.js";
import { IdParamDto } from "../common/catalog-list.js";
import { StreamsService } from "../streams/streams.service.js";
import { GameSessionHistoryQueryDto } from "./dto/game-session-history-query.dto.js";
import { GameSessionsService } from "./game-sessions.service.js";

// Chỉ đọc. Phạm vi nhìn thấy theo stream (USER chỉ thấy stream ACTIVE), giống GET /streams/:id.
@Controller("streams/:id/game-sessions")
export class GameSessionsController {
  constructor(private sessions: GameSessionsService, private streams: StreamsService) {}

  @Get()
  async history(@CurrentUser() actor: AuthUser, @Param() params: IdParamDto, @Query() query: GameSessionHistoryQueryDto) {
    await this.streams.getOne(actor.role, params.id);   // 404 nếu không tồn tại / ngoài phạm vi
    return this.sessions.history(params.id, query.shoe, query.page, query.limit);
  }
}
