// src/users/users.controller.ts
import { Body, Controller, HttpCode, Param, Patch, Post } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { GrantPointsDto } from "./dto/grant-points.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserStatusDto, UserIdParamDto } from "./dto/update-user-status.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private users: UsersService) {}

  @Post()
  @Roles("HOST", "ADMIN")
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Patch(":userId")
  @Roles("HOST", "ADMIN")
  @HttpCode(200)
  update(@CurrentUser() actor: AuthUser, @Param() params: UserIdParamDto, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, params.userId, dto);
  }

  @Patch(":userId/status")
  @Roles("HOST", "ADMIN")
  @HttpCode(200)
  updateStatus(@CurrentUser() actor: AuthUser, @Param() params: UserIdParamDto, @Body() dto: UpdateUserStatusDto) {
    return this.users.updateStatus(actor, params.userId, dto.status, dto.transfer_to_admin_id);
  }

  @Post(":userId/points")
  @Roles("HOST", "ADMIN")
  @HttpCode(200)
  grantPoints(@CurrentUser() actor: AuthUser, @Param() params: UserIdParamDto, @Body() dto: GrantPointsDto) {
    return this.users.grantPoints(actor, params.userId, dto.amount);
  }
}
