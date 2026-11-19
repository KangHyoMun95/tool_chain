// src/registration/registration.guard.ts
// Giới hạn rộng số request đăng ký theo IP (chặn spam). Chạy TRƯỚC ValidationPipe nên request sai định dạng cũng bị tính.
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { normalizeIp } from "./ip.util.js";
import { RegistrationService } from "./registration.service.js";

@Injectable()
export class RegistrationRequestGuard implements CanActivate {
  constructor(private registration: RegistrationService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (await this.registration.allowRequest(normalizeIp(req.ip))) return true;
    throw new HttpException({ statusCode: 429, code: "REGISTER_LIMIT", message: "Too many registration requests" }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
