// src/common/redis-throttler.storage.ts
import type { ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface.js";
import { Redis } from "ioredis";

const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { hits, redis.call('PTTL', KEYS[1]) }
`;

// ttl và blockDuration của @nestjs/throttler tính bằng mili giây.
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private redis: Redis) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitsKey}:blocked`;

    const blockedFor = await this.redis.pttl(blockKey);
    if (blockedFor > 0) {
      return { totalHits: limit + 1, timeToExpire: blockedFor, isBlocked: true, timeToBlockExpire: blockedFor };
    }

    const [totalHits, pttl] = (await this.redis.eval(INCREMENT_SCRIPT, 1, hitsKey, ttl)) as [number, number];
    const timeToExpire = Math.max(pttl, 0);

    if (totalHits > limit && blockDuration > 0) {
      await this.redis.set(blockKey, "1", "PX", blockDuration);
      return { totalHits, timeToExpire, isBlocked: true, timeToBlockExpire: blockDuration };
    }
    return { totalHits, timeToExpire, isBlocked: totalHits > limit, timeToBlockExpire: 0 };
  }
}
