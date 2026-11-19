// src/registration/registration.guard.ts
// Giới hạn rộng số request đăng ký theo IP (chặn spam). Chạy TRƯỚC ValidationPipe nên request sai định dạng cũng bị tính.
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";
import { normalizeIp } from "./ip.util.js";
import { ENFORCE_REGISTER_IP_LIMIT } from "./registration.limits.js";
import { RegistrationService } from "./registration.service.js";

@Injectable()
export class RegistrationRequestGuard implements CanActivate {
  private readonly log = new Logger(RegistrationRequestGuard.name);

  constructor(private registration: RegistrationService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const ip = normalizeIp(req.ip);
    const check = await this.registration.allowRequest(ip);
    if (check.allowed) return true;
    // Hiện chỉ log (ENFORCE_REGISTER_IP_LIMIT = false): vẫn cho đi tiếp.
    this.log.warn(`Request đăng ký vượt ngưỡng theo IP, ${ENFORCE_REGISTER_IP_LIMIT ? "đã chặn" : "lẽ ra đã chặn"}: ip=${ip}, count=${check.count}, limit=${check.limit}`);
    if (!ENFORCE_REGISTER_IP_LIMIT) return true;
    throw new HttpException({ statusCode: 429, code: "REGISTER_LIMIT", message: "Too many registration requests" }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
