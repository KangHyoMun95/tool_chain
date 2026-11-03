// src/realtime/realtime.hub.ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { TICK_STREAM } from "@toolhackchain/shared";
import { fieldsToObject, sleep, StreamEntry } from "../common/stream.util.js";

type Listener = (tickJson: string) => void;

@Injectable()
export class RealtimeHub implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(RealtimeHub.name);
  private conn = new Redis(process.env.REDIS_URL!);
  private running = true;
  private listeners = new Map<string, Set<Listener>>();   // item_id -> listeners

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
          this.listeners.get(item_id)?.forEach((fn) => fn(tick));
        }
      } catch (e) {
        if (!this.running) break;
        this.log.error(e);
        await sleep(1000);
      }
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