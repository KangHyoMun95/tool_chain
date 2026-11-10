// src/billing/settle-queue.service.ts
// Ghi tín hiệu settle:requests. Gửi trùng vô hại (settlement idempotent, dựa vào refunded_at IS NULL).
import { Inject, Injectable } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisKeys, SETTLE_REQUEST_STREAM, SETTLE_STREAM_MAXLEN, type SettleReason, type SettleRequest } from "@toolhackchain/shared";
import { REDIS } from "../redis/redis.module.js";
import { SETTLE_REQ_DEDUPE_SECONDS } from "./billing.constants.js";

@Injectable()
export class SettleQueue {
  constructor(@Inject(REDIS) private redis: Redis) {}

  /** Gọi SAU khi DB đã commit trạng thái FINISHED / CANCELLED của các ván. */
  async enqueue(gameSessionIds: string[], reason: SettleReason): Promise<void> {
    if (gameSessionIds.length === 0) return;
    const pipe = this.redis.pipeline();
    for (const id of gameSessionIds) {
      const msg: SettleRequest = { game_session_id: id, reason };
      pipe.xadd(SETTLE_REQUEST_STREAM, "MAXLEN", "~", SETTLE_STREAM_MAXLEN, "*", "payload", JSON.stringify(msg));
    }
    const res = await pipe.exec();
    const failed = res?.find(([err]) => err);
    if (failed) throw failed[0];
  }

  /** Sweeper: chỉ gửi khi chưa gửi cho ván này trong SETTLE_REQ_DEDUPE_SECONDS (SET NX thất bại thì bỏ qua). Trả số tin đã gửi. */
  async enqueueDeduped(items: { id: string; reason: SettleReason }[]): Promise<number> {
    let sent = 0;
    for (const it of items) {
      const ok = await this.redis.set(RedisKeys.settleReq(it.id), "1", "EX", SETTLE_REQ_DEDUPE_SECONDS, "NX");
      if (ok !== "OK") continue;
      await this.enqueue([it.id], it.reason);
      sent++;
    }
    return sent;
  }
}
