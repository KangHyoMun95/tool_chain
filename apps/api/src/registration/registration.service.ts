// src/registration/registration.service.ts
// Tự đăng ký USER: không cần Admin duyệt. Cấp trên luôn là MAIN_ADMIN_USER_ID (ADMIN chính, tạo bằng CLI --fixed-admin-id).
import { createHash, randomUUID } from "node:crypto";
import { HttpException, HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import argon2 from "argon2";
import { createChallenge, verifySolution } from "altcha-lib/v1";
import type { Redis } from "ioredis";
import { QueryFailedError, type DataSource } from "typeorm";
import { MAIN_ADMIN_USER_ID, UserStatus } from "@toolhackchain/shared";
import { ARGON2_OPTIONS } from "../auth/password.js";
import type { EnvVars } from "../config/env.validation.js";
import { REDIS } from "../redis/redis.module.js";
import type { RegisterDto } from "./dto/register.dto.js";
import { ENFORCE_REGISTER_IP_LIMIT, LimitCheck, RegistrationLimits, altchaUsedKey } from "./registration.limits.js";

const UNIQUE_VIOLATION = "23505";

/** Mã lỗi cho portal (body `{ code, message }`). */
export type RegistrationErrorCode = "PASSWORD_MISMATCH" | "REGISTRATION_FAILED" | "REGISTER_LIMIT" | "CAPTCHA_FAILED" | "REGISTRATION_NOT_READY";

const fail = (status: HttpStatus, code: RegistrationErrorCode, message: string) => new HttpException({ statusCode: status, code, message }, status);

@Injectable()
export class RegistrationService {
  private readonly log = new Logger(RegistrationService.name);
  private readonly limits: RegistrationLimits;
  private readonly hmacKey: string;
  private readonly maxNumber: number;
  private readonly challengeTtlS: number;

  constructor(
    @InjectDataSource() private ds: DataSource,
    @Inject(REDIS) private redis: Redis,
    config: ConfigService<EnvVars, true>,
  ) {
    this.hmacKey = config.get("ALTCHA_HMAC_KEY", { infer: true });
    this.maxNumber = config.get("ALTCHA_MAX_NUMBER", { infer: true });
    this.challengeTtlS = config.get("ALTCHA_CHALLENGE_TTL_SECONDS", { infer: true });
    this.limits = new RegistrationLimits(
      redis,
      config.get("REGISTER_MAX_SUCCESS_PER_IP", { infer: true }),
      config.get("REGISTER_SUCCESS_WINDOW_HOURS", { infer: true }) * 3_600_000,
      config.get("REGISTER_MAX_REQUESTS_PER_HOUR", { infer: true }),
      3600,
    );
  }

  /** Dùng bởi guard: đếm một request đăng ký của IP. Redis lỗi ⇒ ném lỗi (không mở cổng). */
  allowRequest(ip: string): Promise<LimitCheck> {
    return this.limits.allowRequest(ip);
  }

  /** Challenge ALTCHA (có hạn). Không cần đăng nhập. */
  challenge() {
    return createChallenge({ hmacKey: this.hmacKey, maxNumber: this.maxNumber, expires: new Date(Date.now() + this.challengeTtlS * 1000) });
  }

  async register(dto: RegisterDto, ip: string): Promise<void> {
    if (dto.password !== dto.confirm_password) throw fail(HttpStatus.BAD_REQUEST, "PASSWORD_MISMATCH", "Password confirmation does not match");

    // Chưa có ADMIN chính ACTIVE ⇒ chưa sẵn sàng (kiểm tra lại trong transaction bên dưới).
    if (!(await this.mainAdminReady())) {
      this.log.error(`Đăng ký bị từ chối: ADMIN chính ${MAIN_ADMIN_USER_ID} chưa tồn tại hoặc không phải ADMIN ACTIVE (chạy CLI create-user --role ADMIN --fixed-admin-id)`);
      throw fail(HttpStatus.SERVICE_UNAVAILABLE, "REGISTRATION_NOT_READY", "Registration is not available yet");
    }

    await this.verifyCaptcha(dto.altcha, ip);

    // Giữ chỗ TRƯỚC khi tạo user; tạo thất bại thì hoàn lại đúng dấu đó.
    const member = randomUUID();
    const check = await this.limits.reserve(ip, member);
    if (!check.allowed) {
      this.log.warn(`Đăng ký thành công vượt ngưỡng theo IP, ${ENFORCE_REGISTER_IP_LIMIT ? "đã chặn" : "lẽ ra đã chặn"}: ip=${ip}, count=${check.count}, limit=${check.limit}`);
      if (ENFORCE_REGISTER_IP_LIMIT) throw fail(HttpStatus.TOO_MANY_REQUESTS, "REGISTER_LIMIT", "Too many registrations from this IP");
    }

    try {
      const hash = await argon2.hash(dto.password, ARGON2_OPTIONS);
      await this.create(dto.phone_number, dto.display_name ?? null, hash);
    } catch (e) {
      await this.limits.release(ip, member).catch((err) => this.log.error(`Không hoàn lại giữ chỗ đăng ký (ip=${ip}): ${err}`));
      if (e instanceof HttpException) throw e;
      if (e instanceof QueryFailedError && (e.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION) {
        throw fail(HttpStatus.BAD_REQUEST, "REGISTRATION_FAILED", "Unable to create an account with this phone number");
      }
      throw e;
    }
  }

  private async mainAdminReady(): Promise<boolean> {
    const rows: unknown[] = await this.ds.query(
      `SELECT 1 FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = $1 AND r.role_name = 'ADMIN' AND u.status = $2`,
      [MAIN_ADMIN_USER_ID, UserStatus.ACTIVE],
    );
    return rows.length > 0;
  }

  /** Kiểm tra lời giải (chữ ký + hạn + đúng nghiệm) rồi đánh dấu đã dùng: một lời giải chỉ đăng ký được một lần. */
  private async verifyCaptcha(payload: string, ip: string): Promise<void> {
    let ok = false;
    try {
      ok = await verifySolution(payload, this.hmacKey, true);
    } catch {
      ok = false;
    }
    if (ok) {
      const id = createHash("sha256").update(payload).digest("hex");
      const first = await this.redis.set(altchaUsedKey(id), "1", "EX", this.challengeTtlS + 60, "NX");
      ok = first === "OK";
    }
    if (!ok) {
      this.log.warn(`Captcha đăng ký không hợp lệ hoặc đã dùng: ip=${ip}`);
      throw fail(HttpStatus.BAD_REQUEST, "CAPTCHA_FAILED", "Captcha verification failed");
    }
  }

  private async create(phone: string, displayName: string | null, passwordHash: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      // Khóa chia sẻ dòng ADMIN chính: không bị deactive / xóa giữa lúc tạo.
      const admin: unknown[] = await m.query(
        `SELECT 1 FROM users u JOIN roles r ON r.role_id = u.role_id
         WHERE u.user_id = $1 AND r.role_name = 'ADMIN' AND u.status = $2 FOR SHARE OF u`,
        [MAIN_ADMIN_USER_ID, UserStatus.ACTIVE],
      );
      if (admin.length === 0) {
        this.log.error(`Đăng ký bị từ chối: ADMIN chính ${MAIN_ADMIN_USER_ID} không còn ACTIVE`);
        throw fail(HttpStatus.SERVICE_UNAVAILABLE, "REGISTRATION_NOT_READY", "Registration is not available yet");
      }
      await m.query(
        `INSERT INTO users (phone_number, display_name, password, role_id, refer_user_id, status)
         VALUES ($1, $2, $3, (SELECT role_id FROM roles WHERE role_name = 'USER'), $4, $5)`,
        [phone, displayName, passwordHash, MAIN_ADMIN_USER_ID, UserStatus.ACTIVE],
      );
    });
  }
}


