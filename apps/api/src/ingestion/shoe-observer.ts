// src/ingestion/shoe-observer.ts
// Chỉ QUAN SÁT để log hành vi của shoe/round; không ảnh hưởng việc ghi DB.
// Trạng thái gần nhất của mỗi stream nằm trong Redis (stream_last:{key_id}, stream_shoes:{key_id}).
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisKeys } from "@toolhackchain/shared";
import { REDIS } from "../redis/redis.module.js";
import { BoundedMap } from "./bounded-map.js";
import { ID_CACHE_TTL_SECONDS, MEMORY_CACHE_MAX } from "./ingestion.constants.js";

export type ShoeObservation = { keyId: string; stream: string; shoe: number; round: number };
type State = { shoe: number; round: number; seen: Set<number> };

@Injectable()
export class ShoeObserver {
  private readonly log = new Logger(ShoeObserver.name);
  private mem = new BoundedMap<string, State>(MEMORY_CACHE_MAX);
  constructor(@Inject(REDIS) private redis: Redis) {}

  /** Duyệt tick theo thứ tự đến. Không ném lỗi: quan sát hỏng không được làm hỏng batch đã commit. */
  async observe(items: ShoeObservation[]): Promise<void> {
    try {
      const dirty = new Map<string, { st: State; newShoes: Set<number> }>();
      for (const it of items) {
        let st = this.mem.get(it.keyId) ?? (await this.load(it.keyId));
        let isNewShoe = false;
        if (!st) {
          st = { shoe: it.shoe, round: it.round, seen: new Set([it.shoe]) };
          isNewShoe = true;
        } else if (st.shoe !== it.shoe) {
          this.log.log(`Stream "${it.stream}": shoe đổi "${st.shoe}" → "${it.shoe}" (round ${it.round})`);
          if (st.seen.has(it.shoe)) {
            this.log.warn(`Stream "${it.stream}": shoe "${it.shoe}" xuất hiện lại sau khi đã chuyển sang shoe khác (round ${it.round}); shoe đã thấy: ${[...st.seen].join(", ")}`);
          }
          isNewShoe = !st.seen.has(it.shoe);
          st.seen.add(it.shoe);
          st.shoe = it.shoe;
          st.round = it.round;
        } else if (it.round < st.round) {
          this.log.warn(`Stream "${it.stream}": round giảm ${st.round} → ${it.round} nhưng shoe "${it.shoe}" không đổi`);
          st.round = it.round;
        } else if (it.round > st.round) {
          st.round = it.round;
        } else if (!dirty.has(it.keyId)) {
          continue;   // không đổi gì
        }
        this.mem.set(it.keyId, st);
        const entry = dirty.get(it.keyId) ?? { st, newShoes: new Set<number>() };
        if (isNewShoe) entry.newShoes.add(it.shoe);
        dirty.set(it.keyId, entry);
      }

      if (dirty.size === 0) return;
      const pipe = this.redis.pipeline();
      for (const [keyId, { st, newShoes }] of dirty) {
        pipe.hset(RedisKeys.streamLast(keyId), { shoe: String(st.shoe), round: String(st.round) });
        pipe.expire(RedisKeys.streamLast(keyId), ID_CACHE_TTL_SECONDS);
        if (newShoes.size > 0) pipe.sadd(RedisKeys.streamShoes(keyId), ...newShoes);
        pipe.expire(RedisKeys.streamShoes(keyId), ID_CACHE_TTL_SECONDS);
      }
      await pipe.exec();
    } catch (e) {
      this.log.error(`Không ghi được trạng thái shoe: ${(e as Error).message}`);
    }
  }

  private async load(keyId: string): Promise<State | undefined> {
    const [last, shoes] = await Promise.all([
      this.redis.hgetall(RedisKeys.streamLast(keyId)),
      this.redis.smembers(RedisKeys.streamShoes(keyId)),
    ]);
    if (!last.shoe) return undefined;
    const shoe = Number(last.shoe);
    const st: State = { shoe, round: Number(last.round), seen: new Set([...shoes.map(Number), shoe]) };
    this.mem.set(keyId, st);
    return st;
  }
}
