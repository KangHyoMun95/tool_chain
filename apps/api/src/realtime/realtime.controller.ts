// src/realtime/realtime.controller.ts
import { BadRequestException, Controller, Inject, MessageEvent, Query, Req, Sse, UseGuards } from "@nestjs/common";
import { Observable } from "rxjs";
import { Redis } from "ioredis";
import { RedisKeys } from "@toolhackchain/shared";
import { REDIS } from "../redis/redis.module.js";
import { RealtimeHub } from "./realtime.hub.js";
// import { SessionGuard } from "../auth/session.guard.js";
// import { PermissionService } from "../auth/permission.service.js";
// import { StreamItemsGuard } from "./stream-items.guard.js";

@Controller("stream")
export class RealtimeController {
  constructor(
    private hub: RealtimeHub,
    // private perms: PermissionService,
    @Inject(REDIS) private redis: Redis,
  ) {}

  @Sse()
  // @UseGuards(SessionGuard, StreamItemsGuard)
  stream(@Query("items") itemsParam = ""): Observable<MessageEvent> {
    // const userId: string = req.user.id;
    // const items: string[] = req.allowedItems;
    const items = itemsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) throw new BadRequestException("Thiếu ?items=");

    return new Observable<MessageEvent>((sub) => {
      // 1) Snapshot
      this.redis.mget(items.map(RedisKeys.latest))
        .then((snaps) => snaps.forEach((s) => s && sub.next({ data: s })))
        .catch((e) => sub.error(e));

      // 2) Realtime
      const unsubs = items.map((id) => this.hub.subscribe(id, (tick) => sub.next({ data: tick })));

      // 3) Giữ kết nối + kiểm tra quyền định kỳ
      const heartbeat = setInterval(() => sub.next({ type: "ping", data: "" }), 15_000);
      // const recheck = setInterval(async () => {
      //   const now = await this.perms.allowedItems(userId);
      //   if (items.some((i) => !now.has(i))) {
      //     sub.next({ type: "revoked", data: "{}" });
      //     sub.complete();
      //   }
      // }, 30_000);

      // Chạy khi client ngắt hoặc stream kết thúc
      return () => {
        clearInterval(heartbeat);
        // clearInterval(recheck);
        unsubs.forEach((u) => u());
      };
    });
  }
}