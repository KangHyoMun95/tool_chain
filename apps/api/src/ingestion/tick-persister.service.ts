// src/ingestion/tick-persister.service.ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { hostname } from "os";
import { PERSIST_GROUP, TICK_STREAM, Tick } from "@toolhackchain/shared";
import { fieldsToObject, sleep, StreamEntry } from "../common/stream.util.js";
import { IngestionService } from "./ingestion.service.js";
import { MAX_BATCH, MAX_WAIT_MS, RETRY_DELAY_MS } from "./ingestion.constants.js";
import { deadLetterTick, isDataError, pgErrorCode } from "./dead-letter.js";

// tick = null: tin hỏng (không parse được), chỉ cần XACK để khỏi kẹt trong PEL
type Item = { id: string; tick: Tick | null };

@Injectable()
export class TickPersister implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(TickPersister.name);
  private conn = new Redis(process.env.REDIS_URL!);      // kết nối riêng vì sẽ BLOCK
  private running = true;
  private consumer = process.env.CONSUMER_NAME ?? hostname(); // cố định qua các lần restart

  private buffer: Item[] = [];
  private bufferSince = 0;

  constructor(private ingestion: IngestionService) {}

  async onApplicationBootstrap() {
    try {
      await this.conn.xgroup("CREATE", TICK_STREAM, PERSIST_GROUP, "0", "MKSTREAM");
    } catch (e) {
      if (!String(e).includes("BUSYGROUP")) throw e;     // group đã tồn tại là bình thường
    }
    void this.loop();
  }

  private async loop() {
    // "0" = xử lý nốt tin chưa ack của mình; tin còn pending nên phải nhích cursor theo id đã đọc,
    // nếu không sẽ đọc lại đúng những tin đó.
    let cursor = "0";
    let replaying = true;

    while (this.running) {
      try {
        if (this.shouldFlush()) await this.flush();

        // Chỉ chờ tới hạn xả, không chờ lâu hơn
        const blockMs = this.buffer.length
          ? Math.max(1, MAX_WAIT_MS - (Date.now() - this.bufferSince))
          : 2_000;

        const res = (await this.conn.xreadgroup(
          "GROUP", PERSIST_GROUP, this.consumer,
          "COUNT", MAX_BATCH - this.buffer.length, "BLOCK", blockMs,
          "STREAMS", TICK_STREAM, cursor,
        )) as [string, StreamEntry[]][] | null;

        const entries = res?.[0]?.[1] ?? [];
        if (replaying && entries.length === 0) { replaying = false; cursor = ">"; continue; } // hết tồn, chuyển sang tin mới
        if (entries.length === 0) continue;

        for (const [id, f] of entries) {
          if (replaying) cursor = id;
          if (this.buffer.length === 0) this.bufferSince = Date.now();
          this.buffer.push({ id, tick: this.parse(id, f) });
        }
      } catch (e) {
        if (!this.running) break;
        this.log.error(e);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  private parse(id: string, f: string[]): Tick | null {
    try {
      return JSON.parse(fieldsToObject(f).tick) as Tick;
    } catch {
      this.log.warn(`Bỏ qua tin ${id}: không parse được JSON`);
      return null;
    }
  }

  onModuleDestroy() {
    this.running = false;
    this.conn.disconnect();
  }

  private shouldFlush() {
    return this.buffer.length >= MAX_BATCH
        || (this.buffer.length > 0 && Date.now() - this.bufferSince >= MAX_WAIT_MS);
  }

  /**
   * Ghi cả nhóm trong một transaction. Gặp lỗi dữ liệu thì chia đôi và ghi từng nửa để cô lập tick độc;
   * tick độc đơn lẻ được chuyển vào ticks:dead (rồi được XACK cùng batch), các tick còn lại đi tiếp.
   */
  private async persistIsolating(items: (Item & { tick: Tick })[]): Promise<void> {
    if (items.length === 0) return;
    try {
      await this.ingestion.persist(items.map((i) => i.tick));
    } catch (e) {
      if (!isDataError(e)) throw e;
      if (items.length === 1) {
        const [{ id, tick }] = items;
        this.log.error(`Tick ${tick.id} (${tick.item_id}) lỗi dữ liệu ${pgErrorCode(e)}, chuyển vào ticks:dead`);
        await deadLetterTick(this.conn, id, tick, e);
        return;
      }
      const mid = Math.ceil(items.length / 2);
      await this.persistIsolating(items.slice(0, mid));
      await this.persistIsolating(items.slice(mid));
    }
  }

  private async flush() {
    const batch = this.buffer;

    // Lỗi tạm thời (DB sập...) → ném ra, buffer giữ nguyên, không XACK, vòng lặp thử lại.
    await this.persistIsolating(batch.filter((b): b is Item & { tick: Tick } => b.tick !== null));
    this.log.log(`flush ${batch.length} tick`);

    await this.conn.xack(TICK_STREAM, PERSIST_GROUP, ...batch.map((b) => b.id));
    this.buffer = [];          // chỉ xoá sau khi DB đã commit và ack thành công
  }
}
