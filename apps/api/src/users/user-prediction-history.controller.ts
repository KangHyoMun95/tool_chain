// src/users/user-prediction-history.controller.ts
import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { PredictionHistoryQueryDto } from "./dto/prediction-history-query.dto.js";
import { UserPredictionHistoryService } from "./user-prediction-history.service.js";

@Controller("admin/users")
export class UserPredictionHistoryController {
  constructor(private history: UserPredictionHistoryService) {}

  @Get(":userId/prediction-history")
  @Roles("HOST", "ADMIN")
  list(@CurrentUser() actor: AuthUser, @Param("userId", ParseUUIDPipe) userId: string, @Query() q: PredictionHistoryQueryDto) {
    return this.history.list(actor, userId, q);
  }

  /** Cây sảnh → game → bàn mà user có dữ liệu, cho dropdown lọc. */
  @Get(":userId/prediction-history/filters")
  @Roles("HOST", "ADMIN")
  filters(@CurrentUser() actor: AuthUser, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.history.filters(actor, userId);
  }
}
