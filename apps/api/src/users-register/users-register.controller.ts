// src/users-register/users-register.controller.ts
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/decorators.js";
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
}
