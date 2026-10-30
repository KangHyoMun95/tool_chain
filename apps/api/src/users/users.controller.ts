// src/users/users.controller.ts
import { Body, Controller, HttpCode, Param, Patch } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { UpdateUserStatusDto, UserIdParamDto } from "./dto/update-user-status.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private users: UsersService) {}

  @Patch(":userId/status")
  @Roles("HOST", "ADMIN")
  @HttpCode(200)
  updateStatus(@CurrentUser() actor: AuthUser, @Param() params: UserIdParamDto, @Body() dto: UpdateUserStatusDto) {
    return this.users.updateStatus(actor, params.userId, dto.status);
  }
}
