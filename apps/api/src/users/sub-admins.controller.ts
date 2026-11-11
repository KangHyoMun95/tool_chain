// src/users/sub-admins.controller.ts
import { Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
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
}
