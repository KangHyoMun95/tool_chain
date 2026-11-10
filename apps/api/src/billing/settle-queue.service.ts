// src/billing/settle-queue.service.ts
// Nơi DUY NHẤT ghi tín hiệu settle:requests (ingestion, job hủy ván, sweeper đều gọi qua đây).
// Gửi trùng vô hại (settlement idempotent, dựa vào refunded_at IS NULL).
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import {
  buildSettleMessage, parseSettleMessage, RedisKeys, SETTLE_REQUEST_STREAM, SETTLE_STREAM_MAXLEN, type SettleReason,
} from "@toolhackchain/shared";
import { REDIS } from "../redis/redis.module.js";
import { SETTLE_REQ_DEDUPE_SECONDS } from "./billing.constants.js";

@Injectable()
export class SettleQueue {
  private readonly log = new Logger(SettleQueue.name);

  constructor(@Inject(REDIS) private redis: Redis) {}

  /** Build rồi parse lại ngay: sai contract ⇒ log ERROR tại nơi gửi, trả null (không XADD). */
  private build(gameSessionId: unknown, reason: SettleReason): string[] | null {
    const fields = buildSettleMessage(gameSessionId as string, reason);
    const parsed = parseSettleMessage(fields);
    if (!parsed.ok) {
      this.log.error(`Không gửi settle:requests sai contract (${parsed.error}): ${JSON.stringify(fields)}`);
      return null;
    }
    return fields;
  }

  /** Gọi SAU khi DB đã commit trạng thái FINISHED / CANCELLED của các ván. Trả số tin đã XADD. */
  async enqueue(gameSessionIds: string[], reason: SettleReason): Promise<number> {
    const msgs = gameSessionIds.map((id) => this.build(id, reason)).filter((f): f is string[] => f !== null);
    if (msgs.length === 0) return 0;
    const pipe = this.redis.pipeline();
    for (const fields of msgs) pipe.xadd(SETTLE_REQUEST_STREAM, "MAXLEN", "~", SETTLE_STREAM_MAXLEN, "*", ...fields);
    const res = await pipe.exec();
    const failed = res?.find(([err]) => err);
    if (failed) throw failed[0];
    return msgs.length;
  }

  /** Sweeper: chỉ gửi khi chưa gửi cho ván này trong SETTLE_REQ_DEDUPE_SECONDS (SET NX thất bại thì bỏ qua). Trả số tin đã gửi. */
  async enqueueDeduped(items: { id: string; reason: SettleReason }[]): Promise<number> {
    let sent = 0;
    for (const it of items) {
      if (!this.build(it.id, it.reason)) continue;   // kiểm tra trước SET NX để không chặn lượt gửi sau
      const ok = await this.redis.set(RedisKeys.settleReq(it.id), "1", "EX", SETTLE_REQ_DEDUPE_SECONDS, "NX");
      if (ok !== "OK") continue;
      sent += await this.enqueue([it.id], it.reason);
    }
    return sent;
  }
}
