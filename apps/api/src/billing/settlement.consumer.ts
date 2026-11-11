// src/billing/settlement.consumer.ts
// Đọc settle:requests (group `settle`, consumer cố định, PEL trước rồi ">"): hoàn tiền ván → commit → XACK.
// Idempotent: BillingService.refund chỉ đụng subscription refunded_at IS NULL, nên tin trùng / replay không hoàn thêm.
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { hostname } from "os";
import {
  parseSettleMessage, SETTLE_DEAD_MAXLEN, SETTLE_DEAD_STREAM, SETTLE_GROUP, SETTLE_REQUEST_STREAM,
} from "@toolhackchain/shared";
import { sleep, StreamEntry } from "../common/stream.util.js";
import { withTimeout } from "../common/with-timeout.js";
import { REDIS_COMMAND_TIMEOUT_MS, REDIS_KEEPALIVE_MS } from "../predictions/predictions.constants.js";
import { BillingService } from "./billing.service.js";
import {
  SETTLE_BLOCK_MS, SETTLE_HANDLE_TIMEOUT_MS, SETTLE_READ_COUNT, SETTLE_RETRY_DELAY_MS, SETTLE_SLOW_WARN_MS,
} from "./billing.constants.js";

@Injectable()
export class SettlementConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(SettlementConsumer.name);
  private conn = new Redis(process.env.REDIS_URL!, { commandTimeout: REDIS_COMMAND_TIMEOUT_MS, keepAlive: REDIS_KEEPALIVE_MS });
  private running = true;
  private consumer = process.env.CONSUMER_NAME ?? hostname();

  constructor(private billing: BillingService) {}

  async onApplicationBootstrap() {
    if (!this.billing.refundEnabled) this.log.warn("Hoàn tiền đang TẮT (HAS_REFUND=false): settle:requests được đọc và XACK nhưng không hoàn tiền");
    try {
      await this.conn.xgroup("CREATE", SETTLE_REQUEST_STREAM, SETTLE_GROUP, "$", "MKSTREAM");
    } catch (e) {
      if (!String(e).includes("BUSYGROUP")) throw e;
    }
    void this.loop();
  }

  onModuleDestroy() {
    this.running = false;
    this.conn.disconnect();
  }

  private async loop() {
    let cursor = "0";
    let replaying = true;
    while (this.running) {
      try {
        const res = (await this.conn.xreadgroup(
          "GROUP", SETTLE_GROUP, this.consumer, "COUNT", SETTLE_READ_COUNT, "BLOCK", SETTLE_BLOCK_MS,
          "STREAMS", SETTLE_REQUEST_STREAM, cursor,
        )) as [string, StreamEntry[]][] | null;
        const entries = res?.[0]?.[1] ?? [];
        if (replaying && entries.length === 0) { replaying = false; cursor = ">"; continue; }
        for (const [id, fields] of entries) {
          const started = Date.now();
          await withTimeout(this.handle(id, fields), SETTLE_HANDLE_TIMEOUT_MS, `settle:requests ${id}`);
          const took = Date.now() - started;
          if (took >= SETTLE_SLOW_WARN_MS) this.log.warn(`settle:requests ${id}: xử lý chậm ${took}ms`);
          await this.conn.xack(SETTLE_REQUEST_STREAM, SETTLE_GROUP, id);   // sau khi refund đã commit
          if (replaying) cursor = id;
        }
      } catch (e) {
        if (!this.running) break;
        this.log.error(e);
        await sleep(SETTLE_RETRY_DELAY_MS);
        replaying = true;
        cursor = "0";
      }
    }
  }

  /**
   * Message sai contract: log ERROR kèm toàn bộ nội dung, chép sang settle:dead rồi mới để caller XACK
   * (XADD settle:dead lỗi ⇒ ném, không XACK, loop thử lại). Lỗi DB: ném để loop thử lại từ PEL.
   */
  private async handle(id: string, fields: string[]): Promise<void> {
    const parsed = parseSettleMessage(fields);
    if (!parsed.ok) {
      const content = JSON.stringify(fields);
      this.log.error(`settle:requests ${id}: message không đúng contract (${parsed.error}), chuyển sang ${SETTLE_DEAD_STREAM}: ${content}`);
      await this.conn.xadd(
        SETTLE_DEAD_STREAM, "MAXLEN", "~", SETTLE_DEAD_MAXLEN, "*",
        "source_id", id, "error", parsed.error, "fields", content, "dead_at", new Date().toISOString(),
      );
      return;
    }
    const msg = parsed.value;
    if (!this.billing.refundEnabled) {
      this.log.debug(`settle:requests ${id}: bỏ qua hoàn tiền ván ${msg.game_session_id} (${msg.reason}) vì HAS_REFUND=false`);
      return;
    }
    const n = await this.billing.refund(msg.game_session_id);
    if (n > 0) this.log.log(`Hoàn tiền ván ${msg.game_session_id} (${msg.reason}): ${n} subscription`);
  }
}
