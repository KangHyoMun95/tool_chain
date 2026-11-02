// src/ingestion/id-cache.service.ts
import { Inject, Injectable } from "@nestjs/common";
import { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module.js";
import { BoundedMap } from "./bounded-map.js";
import { ID_CACHE_TTL_SECONDS, MEMORY_CACHE_MAX } from "./ingestion.constants.js";

const PATTERNS = ["lobby:*", "category:*", "stream:*"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cache key → id (bộ nhớ trước, Redis sau). Chỉ ghi sau khi DB đã commit. */
@Injectable()
export class IdCache {
  private mem = new BoundedMap<string, string>(MEMORY_CACHE_MAX);
  constructor(@Inject(REDIS) private redis: Redis) {}

  async getMany(keys: string[]): Promise<(string | undefined)[]> {
    const out: (string | undefined)[] = keys.map((k) => this.mem.get(k));
    const missIdx = out.flatMap((v, i) => (v === undefined ? [i] : []));
    if (missIdx.length === 0) return out;
    const vals = await this.redis.mget(missIdx.map((i) => keys[i]));
    vals.forEach((v, n) => {
      if (v === null || !UUID_RE.test(v)) return;   // id cũ dạng số (trước V7) coi như cache miss
      out[missIdx[n]] = v;
      this.mem.set(keys[missIdx[n]], v);
    });
    return out;
  }

  async setMany(entries: [key: string, id: string][]): Promise<void> {
    if (entries.length === 0) return;
    const pipe = this.redis.pipeline();
    for (const [k, id] of entries) {
      this.mem.set(k, id);
      pipe.set(k, id, "EX", ID_CACHE_TTL_SECONDS);
    }
    await pipe.exec();
  }

  /** Dùng khi id trong cache không còn tồn tại trong DB (vd DB bị reset). */
  async invalidate(): Promise<void> {
    this.mem.clear();
    for (const match of PATTERNS) {
      for await (const keys of this.redis.scanStream({ match, count: 500 })) {
        if ((keys as string[]).length > 0) await this.redis.del(...(keys as string[]));
      }
    }
  }
}
