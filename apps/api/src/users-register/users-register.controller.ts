// src/users-register/users-register.controller.ts
import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser, Public, Roles } from "../auth/decorators.js";
import { ActivateRegisterDto, RegisterIdParamDto } from "./dto/activate-register.dto.js";
import { RegisterListQueryDto } from "./dto/register-list-query.dto.js";
import { RegisterPhoneDto } from "./dto/register-phone.dto.js";
import { UsersRegisterService } from "./users-register.service.js";

@Controller("users-register")
export class UsersRegisterController {
  constructor(private usersRegister: UsersRegisterService) {}

  // Công khai (chưa đăng nhập) nên giới hạn chặt theo IP để không bị spam đầy bảng.
  @Public()
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterPhoneDto) {
    await this.usersRegister.register(dto.phone_number);
    return { status: "received" };
  }

  @Get()
  @Roles("HOST")
  list(@Query() q: RegisterListQueryDto) {
    return this.usersRegister.list(q.page, q.limit);
  }

  @Get("admins")
  @Roles("HOST")
  admins(@CurrentUser() actor: AuthUser) {
    return this.usersRegister.adminOptions(actor);
  }

  @Post(":id/activate")
  @Roles("HOST")
  @HttpCode(201)
  activate(@CurrentUser() actor: AuthUser, @Param() p: RegisterIdParamDto, @Body() dto: ActivateRegisterDto) {
    return this.usersRegister.activate(actor, p.id, dto);
  }
}
