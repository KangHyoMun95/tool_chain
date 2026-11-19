// src/registration/registration.limits.ts
// Giới hạn đăng ký theo IP, lưu Redis. Ngưỡng cấu hình bằng env (config/env.validation.ts).
import type { Redis } from "ioredis";

/**
 * Công tắc chặn theo IP. false = CHỈ ĐẾM VÀ LOG WARN "lẽ ra đã chặn", không từ chối request.
 * Chỉ đổi thành true sau khi xác nhận trên server rằng log "Đăng ký: ip=..." là IP thật của người dùng
 * (xem TRUST_PROXY trong CLAUDE.md); nếu IP là IP proxy thì mọi người dùng chung một bộ đếm và sẽ bị chặn oan.
 */
export const ENFORCE_REGISTER_IP_LIMIT = false;

export interface LimitCheck {
  allowed: boolean; // false = đã vượt ngưỡng (có chặn hay không tùy ENFORCE_REGISTER_IP_LIMIT)
  count: number; // số lần tính cả lần này
  limit: number;
}

export const regSuccessKey = (ip: string) => `reg:ok:${ip}`;
export const regRequestKey = (ip: string) => `reg:req:${ip}`;
export const altchaUsedKey = (id: string) => `altcha:used:${id}`;

// KEYS[1] = ZSET các lần đăng ký (đã) thành công của IP; ARGV = now_ms, window_ms, max, member, enforce (1|0).
// Bỏ dấu cũ hơn cửa sổ trượt; còn chỗ thì ZADD một dấu (giữ chỗ) ngay trong script nên không có khe đồng thời.
// Hết chỗ: enforce = 1 ⇒ không ZADD, trả {0, count}; enforce = 0 ⇒ vẫn ZADD (để đếm tiếp), trả {0, count sau khi thêm}.
const RESERVE_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[1]) - tonumber(ARGV[2]))
local n = redis.call('ZCARD', KEYS[1])
local full = n >= tonumber(ARGV[3])
if full and ARGV[5] == '1' then return {0, n} end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return {full and 0 or 1, n + 1}
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

  /** Đếm một request đăng ký (luôn đếm, kể cả khi không chặn). */
  async allowRequest(ip: string): Promise<LimitCheck> {
    const n = Number(await this.redis.eval(COUNT_LUA, 1, regRequestKey(ip), this.requestWindowS));
    return { allowed: n <= this.maxRequests, count: n, limit: this.maxRequests };
  }

  /** Giữ chỗ một lần thành công (member dùng để hoàn lại khi tạo user thất bại). */
  async reserve(ip: string, member: string): Promise<LimitCheck> {
    const [ok, count] = (await this.redis.eval(
      RESERVE_LUA, 1, regSuccessKey(ip), Date.now(), this.successWindowMs, this.maxSuccess, member, ENFORCE_REGISTER_IP_LIMIT ? 1 : 0,
    )) as [number, number];
    return { allowed: Number(ok) === 1, count: Number(count), limit: this.maxSuccess };
  }

  async release(ip: string, member: string): Promise<void> {
    await this.redis.zrem(regSuccessKey(ip), member);
  }
}
