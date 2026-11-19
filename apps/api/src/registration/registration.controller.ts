// src/registration/registration.controller.ts
import { Body, Controller, Get, HttpCode, Logger, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { Public } from "../auth/decorators.js";
import { RegisterDto } from "./dto/register.dto.js";
import { RegistrationRequestGuard } from "./registration.guard.js";
import { isPrivateIp, normalizeIp } from "./ip.util.js";
import { RegistrationService } from "./registration.service.js";

@Controller("register")
export class RegistrationController {
  private readonly log = new Logger(RegistrationController.name);

  constructor(private registration: RegistrationService) {}

  // Công khai, giới hạn tần suất riêng (không tốn tài nguyên DB, chỉ HMAC).
  @Public()
  @Get("challenge")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  challenge() {
    return this.registration.challenge();
  }

  @Public()
  @Post()
  @HttpCode(201)
  @UseGuards(RegistrationRequestGuard)
  async register(@Req() req: Request, @Body() dto: RegisterDto) {
    const ip = normalizeIp(req.ip);
    if (isPrivateIp(ip)) {
      this.log.warn(`Đăng ký nhận IP nội bộ/private: ip=${ip} (proxy chưa cấu hình đúng? xem TRUST_PROXY)`);
    } else {
      this.log.log(`Đăng ký: ip=${ip}`);
    }
    await this.registration.register(dto, ip);
    return { status: "created" };
  }
}
