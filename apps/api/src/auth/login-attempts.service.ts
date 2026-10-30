// src/auth/login-attempts.service.ts
import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { RedisKeys } from "@toolhackchain/shared";
import type { EnvVars } from "../config/env.validation.js";
import { REDIS } from "../redis/redis.module.js";

// Đếm theo phone kể cả phone không tồn tại, nên việc bị khóa không tiết lộ phone có tồn tại hay không.
@Injectable()
export class LoginAttemptsService {
  constructor(
    @Inject(REDIS) private redis: Redis,
    private config: ConfigService<EnvVars, true>,
  ) {}

  private get lockSeconds(): number {
    return this.config.get("LOGIN_LOCK_MINUTES", { infer: true }) * 60;
  }

  async assertNotLocked(phone: string): Promise<void> {
    const remaining = await this.redis.ttl(RedisKeys.loginLock(phone));
    if (remaining > 0) {
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: "Too many failed attempts. Try again later.", retryAfterSeconds: remaining },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(phone: string): Promise<void> {
    const failKey = RedisKeys.loginFail(phone);
    const count = await this.redis.incr(failKey);
    if (count === 1) await this.redis.expire(failKey, this.lockSeconds);
    if (count >= this.config.get("LOGIN_MAX_ATTEMPTS", { infer: true })) {
      await this.redis.multi().set(RedisKeys.loginLock(phone), "1", "EX", this.lockSeconds).del(failKey).exec();
    }
  }

  async clear(phone: string): Promise<void> {
    await this.redis.del(RedisKeys.loginFail(phone));
  }
}
