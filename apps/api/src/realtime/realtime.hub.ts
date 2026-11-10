// src/realtime/realtime.hub.ts
// Kênh public: chỉ TICK (đọc stream "ticks") theo key_id. Không bao giờ đẩy pick ở đây —
// prediction đi qua ConnectionRegistry, chỉ tới kết nối tham gia của user đã trừ tiền.
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisKeys, TICK_STREAM } from "@toolhackchain/shared";
import { fieldsToObject, sleep, StreamEntry } from "../common/stream.util.js";
import { IdCache } from "../ingestion/id-cache.service.js";

type Listener = (tickJson: string) => void;

@Injectable()
export class RealtimeHub implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(RealtimeHub.name);
  private conn = new Redis(process.env.REDIS_URL!);
  private running = true;
  private listeners = new Map<string, Set<Listener>>();   // item_id -> listeners

  constructor(private ids: IdCache) {}

  onApplicationBootstrap() { void this.loop(); }

  private async loop() {
    let last = "$";                                        // chỉ lấy tin mới từ lúc khởi động
    while (this.running) {
      try {
        const res = (await this.conn.xread(
          "COUNT", 1000, "BLOCK", 5000, "STREAMS", TICK_STREAM, last,
        )) as [string, StreamEntry[]][] | null;
        if (!res) continue;
        for (const [id, f] of res[0][1]) {
          last = id;
          const { item_id, tick } = fieldsToObject(f);
          const fns = this.listeners.get(item_id);
          if (!fns?.size) continue;
          const out = await this.withStreamId(item_id, tick);
          fns.forEach((fn) => fn(out));
        }
      } catch (e) {
        if (!this.running) break;
        this.log.error(e);
        await sleep(1000);
      }
    }
  }

  /** Gắn streams.stream_id (từ cache id) vào tick; chưa có trong cache thì null (ingestion sẽ ghi cache sau khi commit). */
  async withStreamId(itemId: string, tickJson: string): Promise<string> {
    try {
      const [streamId] = await this.ids.getMany([RedisKeys.stream(itemId)]);
      return JSON.stringify({ ...JSON.parse(tickJson), type: "tick", stream_id: streamId ?? null });
    } catch (e) {
      this.log.warn(`Không gắn được stream_id cho ${itemId}: ${e}`);
      return tickJson;
    }
  }

  subscribe(itemId: string, fn: Listener): () => void {
    let set = this.listeners.get(itemId);
    if (!set) this.listeners.set(itemId, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.listeners.delete(itemId);
    };
  }

  onModuleDestroy() {
    this.running = false;
    this.conn.disconnect();
  }
}