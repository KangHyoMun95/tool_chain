// src/registration/registration.limits.ts
// Giới hạn đăng ký theo IP, lưu Redis. Ngưỡng cấu hình bằng env (config/env.validation.ts).
import type { Redis } from "ioredis";

export const regSuccessKey = (ip: string) => `reg:ok:${ip}`;
export const regRequestKey = (ip: string) => `reg:req:${ip}`;
export const altchaUsedKey = (id: string) => `altcha:used:${id}`;

// KEYS[1] = ZSET các lần đăng ký (đã) thành công của IP; ARGV = now_ms, window_ms, max, member.
// Bỏ dấu cũ hơn cửa sổ trượt; nếu còn chỗ thì ZADD một dấu (giữ chỗ) ngay trong script nên không có khe đồng thời.
const RESERVE_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[1]) - tonumber(ARGV[2]))
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

// KEYS[1] = bộ đếm số request đăng ký của IP trong cửa sổ cố định; ARGV = window_seconds. Trả số lần sau khi tăng.
const COUNT_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n
`;

export class RegistrationLimits {
  constructor(
    private readonly redis: Redis,
    private readonly maxSuccess: number,
    private readonly successWindowMs: number,
    private readonly maxRequests: number,
    private readonly requestWindowS: number,
  ) {}

  /** Đếm một request đăng ký; false khi vượt ngưỡng request. */
  async allowRequest(ip: string): Promise<boolean> {
    const n = Number(await this.redis.eval(COUNT_LUA, 1, regRequestKey(ip), this.requestWindowS));
    return n <= this.maxRequests;
  }

  /** Giữ chỗ một lần thành công; trả member để hoàn lại khi tạo user thất bại, null nếu đã đủ ngưỡng trong cửa sổ trượt. */
  async reserve(ip: string, member: string): Promise<boolean> {
    const ok = await this.redis.eval(RESERVE_LUA, 1, regSuccessKey(ip), Date.now(), this.successWindowMs, this.maxSuccess, member);
    return Number(ok) === 1;
  }

  async release(ip: string, member: string): Promise<void> {
    await this.redis.zrem(regSuccessKey(ip), member);
  }
}
