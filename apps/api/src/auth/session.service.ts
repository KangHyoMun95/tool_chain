// src/auth/session.service.ts
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomBytes } from "node:crypto";
import { Redis } from "ioredis";
import { RedisKeys, type Role } from "@toolhackchain/shared";
import type { EnvVars } from "../config/env.validation.js";
import { REDIS } from "../redis/redis.module.js";
import type { SessionRecord } from "./auth.types.js";

export type RotateResult =
  | { status: "ok"; sessionId: string; refreshToken: string; session: SessionRecord }
  | { status: "reused" | "invalid"; sessionId?: string };

// 1 = xoay thành công, -1 = token cũ bị dùng lại, 0 = không hợp lệ / hết phiên.
const ROTATE_SCRIPT = `
if redis.call('EXISTS', KEYS[2]) == 0 then return 0 end
local current = redis.call('HGET', KEYS[1], 'current')
if not current then return 0 end
if current == ARGV[1] then
  redis.call('HSET', KEYS[1], 'previous', current, 'current', ARGV[2])
  redis.call('EXPIRE', KEYS[1], ARGV[3])
  redis.call('EXPIRE', KEYS[2], ARGV[3])
  return 1
end
local previous = redis.call('HGET', KEYS[1], 'previous')
if previous and previous == ARGV[1] then return -1 end
return 0
`;

@Injectable()
export class SessionService {
  constructor(
    @Inject(REDIS) private redis: Redis,
    private config: ConfigService<EnvVars, true>,
  ) {}

  private get ttl(): number {
    return this.config.get("SESSION_TTL_SECONDS", { infer: true });
  }

  // Refresh token = "<sid>.<random>"; Redis chỉ giữ HMAC của <random>.
  private hashSecret(secret: string): string {
    return createHmac("sha256", this.config.get("JWT_REFRESH_SECRET", { infer: true })).update(secret).digest("hex");
  }

  private newSecret(): string {
    return randomBytes(32).toString("base64url");
  }

  async create(userId: string, role: Role): Promise<{ sessionId: string; refreshToken: string }> {
    const sessionId = randomBytes(16).toString("hex");
    const secret = this.newSecret();
    const record: SessionRecord = { user_id: userId, role, created_at: Date.now() };

    await this.redis
      .multi()
      .set(RedisKeys.session(sessionId), JSON.stringify(record), "EX", this.ttl)
      .hset(RedisKeys.refresh(sessionId), { current: this.hashSecret(secret), previous: "" })
      .expire(RedisKeys.refresh(sessionId), this.ttl)
      .sadd(RedisKeys.userSessions(userId), sessionId)
      .expire(RedisKeys.userSessions(userId), this.ttl)
      .exec();

    return { sessionId, refreshToken: `${sessionId}.${secret}` };
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const raw = await this.redis.get(RedisKeys.session(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionRecord;
    } catch {
      return null;
    }
  }

  async rotate(refreshToken: string): Promise<RotateResult> {
    const dot = refreshToken.indexOf(".");
    if (dot <= 0 || refreshToken.length > 200) return { status: "invalid" };
    const sessionId = refreshToken.slice(0, dot);
    const presented = this.hashSecret(refreshToken.slice(dot + 1));

    const nextSecret = this.newSecret();
    const code = (await this.redis.eval(
      ROTATE_SCRIPT, 2, RedisKeys.refresh(sessionId), RedisKeys.session(sessionId),
      presented, this.hashSecret(nextSecret), this.ttl,
    )) as number;

    if (code === -1) return { status: "reused", sessionId };
    if (code !== 1) return { status: "invalid" };

    const session = await this.get(sessionId);
    if (!session) return { status: "invalid" };
    return { status: "ok", sessionId, refreshToken: `${sessionId}.${nextSecret}`, session };
  }

  async updateRole(sessionId: string, session: SessionRecord, role: Role): Promise<void> {
    if (session.role === role) return;
    await this.redis.set(RedisKeys.session(sessionId), JSON.stringify({ ...session, role }), "KEEPTTL");
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.get(sessionId);
    const multi = this.redis.multi().del(RedisKeys.session(sessionId), RedisKeys.refresh(sessionId));
    if (session) multi.srem(RedisKeys.userSessions(session.user_id), sessionId);
    await multi.exec();
  }

  // Gọi khi user bị chuyển sang DEACTIVE / DELETED (hoặc đổi role).
  async revokeAllSessions(userId: string): Promise<void> {
    const setKey = RedisKeys.userSessions(userId);
    const sessionIds = await this.redis.smembers(setKey);
    const multi = this.redis.multi().del(setKey);
    for (const sid of sessionIds) multi.del(RedisKeys.session(sid), RedisKeys.refresh(sid));
    await multi.exec();
  }
}
