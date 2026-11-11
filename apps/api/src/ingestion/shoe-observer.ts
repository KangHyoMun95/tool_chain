// src/ingestion/shoe-observer.ts
// Chỉ QUAN SÁT để log hành vi của shoe/round; không ảnh hưởng việc ghi DB.
// Dùng comparePosition (packages/shared, chung với hub và portal): tick cũ hơn vị trí lớn nhất (tick muộn của ván trước,
// ván cuối của shoe liền trước) ⇒ không log, không cập nhật. Round chỉ reset khi đổi shoe nên không có WARN "round giảm".
// Đổi shoe ⇒ INFO. Trạng thái gần nhất nằm trong Redis (stream_last:{key_id} {shoe, round, prev_shoe}, stream_shoes:{key_id}).
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import { advanceShoe, comparePosition, RedisKeys, type Position, type ShoeContext } from "@toolhackchain/shared";
import { REDIS } from "../redis/redis.module.js";
import { BoundedMap } from "./bounded-map.js";
import { ID_CACHE_TTL_SECONDS, MEMORY_CACHE_MAX } from "./ingestion.constants.js";

export type ShoeObservation = { keyId: string; stream: string; shoe: number; round: number };
type State = { ctx: ShoeContext; pos: Position; seen: Set<number> };

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
        const pos: Position = { shoe: it.shoe, round: it.round };
        if (!st) {
          st = { ctx: { current: it.shoe, previous: null }, pos, seen: new Set([it.shoe]) };
          isNewShoe = true;
        } else {
          const cmp = comparePosition(pos, st.pos, st.ctx);
          if (cmp < 0) continue;   // tick muộn: không log, không cập nhật
          if (it.shoe !== st.ctx.current) {
            const again = st.seen.has(it.shoe);
            this.log.log(`Stream "${it.stream}": shoe đổi "${st.ctx.current}" → "${it.shoe}" (round ${it.round})` +
              (again ? `; shoe này đã thấy trước đó (${[...st.seen].join(", ")})` : ""));
            isNewShoe = !again;
            st.seen.add(it.shoe);
            st.ctx = advanceShoe(st.ctx, it.shoe);
            st.pos = pos;
          } else if (cmp > 0) {
            st.pos = pos;
          } else if (!dirty.has(it.keyId)) {
            continue;   // không đổi gì
          }
        }
        this.mem.set(it.keyId, st);
        const entry = dirty.get(it.keyId) ?? { st, newShoes: new Set<number>() };
        if (isNewShoe) entry.newShoes.add(it.shoe);
        dirty.set(it.keyId, entry);
      }

      if (dirty.size === 0) return;
      const pipe = this.redis.pipeline();
      for (const [keyId, { st, newShoes }] of dirty) {
        const h: Record<string, string> = { shoe: String(st.pos.shoe), round: String(st.pos.round) };
        if (st.ctx.previous !== null) h.prev_shoe = String(st.ctx.previous);
        pipe.hset(RedisKeys.streamLast(keyId), h);
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
    const prev = last.prev_shoe !== undefined && last.prev_shoe !== "" ? Number(last.prev_shoe) : null;   // dòng cũ chưa có prev_shoe
    const st: State = {
      ctx: { current: shoe, previous: prev },
      pos: { shoe, round: Number(last.round) },
      seen: new Set([...shoes.map(Number), shoe]),
    };
    this.mem.set(keyId, st);
    return st;
  }
}
