// src/ticks/tick-persister.service.ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { hostname } from "os";
import { PERSIST_GROUP, TICK_STREAM, Tick } from "@toolhackchain/shared";
import { fieldsToObject, sleep, StreamEntry } from "../common/stream.util.js";

@Injectable()
export class TickPersister implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(TickPersister.name);
  private conn = new Redis(process.env.REDIS_URL!);      // kết nối riêng vì sẽ BLOCK
  private running = true;
  private consumer = process.env.CONSUMER_NAME ?? hostname(); // cố định qua các lần restart

  async onApplicationBootstrap() {
    try {
      await this.conn.xgroup("CREATE", TICK_STREAM, PERSIST_GROUP, "0", "MKSTREAM");
    } catch (e) {
      if (!String(e).includes("BUSYGROUP")) throw e;     // group đã tồn tại là bình thường
    }
    void this.loop();
  }

  private async loop() {
    let cursor = "0";                                     // "0" = xử lý nốt tin chưa ack của mình
    while (this.running) {
      try {
        const res = (await this.conn.xreadgroup(
          "GROUP", PERSIST_GROUP, this.consumer,
          "COUNT", 500, "BLOCK", 2000,
          "STREAMS", TICK_STREAM, cursor,
        )) as [string, StreamEntry[]][] | null;

        const entries = res?.[0]?.[1] ?? [];
        if (cursor === "0" && entries.length === 0) { cursor = ">"; continue; } // hết tồn, chuyển sang tin mới
        if (entries.length === 0) continue;

        const rows = entries.map(([, f]) => {
          const t: Tick = JSON.parse(fieldsToObject(f).tick);
          return { dedupKey: t.id, itemId: t.item_id, sourceTs: new Date(t.ts * 1000), data: t.data };
        });

        for (const r of rows) {
          this.log.log(`${r.itemId} ${r.sourceTs.toISOString()} ${JSON.stringify(r.data)}`);
        }
        await this.conn.xack(TICK_STREAM, PERSIST_GROUP, ...entries.map(([id]) => id)); // ack SAU khi insert
        this.log.debug(`saved ${rows.length}`);
      } catch (e) {
        if (!this.running) break;
        this.log.error(e);
        await sleep(1000);
      }
    }
  }

  onModuleDestroy() {
    this.running = false;
    this.conn.disconnect();
  }
}