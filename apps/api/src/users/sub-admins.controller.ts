// src/users/sub-admins.controller.ts
import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { PageQueryDto } from "./dto/page-query.dto.js";
import { SubAdminListQueryDto } from "./dto/sub-admin-list-query.dto.js";
import { SubAdminsService } from "./sub-admins.service.js";

@Controller("sub-admins")
export class SubAdminsController {
  constructor(private subAdmins: SubAdminsService) {}

  @Get()
  @Roles("HOST", "ADMIN")
  list(@CurrentUser() actor: AuthUser, @Query() query: SubAdminListQueryDto) {
    return this.subAdmins.list(actor, query);
  }

  @Get(":id")
  @Roles("HOST", "ADMIN")
  detail(@CurrentUser() actor: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.subAdmins.detail(actor, id);
  }

  @Get(":id/users")
  @Roles("HOST", "ADMIN")
  users(@CurrentUser() actor: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Query() q: PageQueryDto) {
    return this.subAdmins.usersOf(actor, id, q.page, q.limit);
  }

  @Get(":id/point-transactions")
  @Roles("HOST", "ADMIN")
  pointTransactions(@CurrentUser() actor: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Query() q: PageQueryDto) {
    return this.subAdmins.pointTransactions(actor, id, q.page, q.limit);
  }
}
