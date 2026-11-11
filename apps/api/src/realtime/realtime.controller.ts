// src/realtime/realtime.controller.ts
// SSE ghi tay bằng @Res() (không dùng @Sse/Observable) để biết được lỗi ghi và tự đóng kết nối kèm lý do.
import { Body, Controller, Get, HttpCode, Inject, Logger, Post, Query, Res, UnauthorizedException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Redis } from "ioredis";
import { RedisKeys } from "@toolhackchain/shared";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser, Public } from "../auth/decorators.js";
import { SessionService } from "../auth/session.service.js";
import { REDIS } from "../redis/redis.module.js";
import { ConnectionRegistry } from "./connection-registry.js";
import { SseTicketDto } from "./dto/sse-ticket.dto.js";
import { RealtimeTicketService } from "./realtime-ticket.service.js";
import { RealtimeHub } from "./realtime.hub.js";
import { SOCKET_KEEPALIVE_MS } from "./realtime.constants.js";
import { SseConnection } from "./sse-connection.js";

@Controller()
export class RealtimeController {
  private readonly log = new Logger(RealtimeController.name);

  constructor(
    private hub: RealtimeHub,
    private registry: ConnectionRegistry,
    private tickets: RealtimeTicketService,
    private sessions: SessionService,
    @Inject(REDIS) private redis: Redis,
  ) {}

  /** Ticket một lần (TTL 30s) cho GET /api/stream. Trang chi tiết gửi participate_stream_id (402 khi không đủ điểm). */
  @Post("realtime/ticket")
  @HttpCode(201)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  ticket(@CurrentUser() actor: AuthUser, @Body() dto: SseTicketDto) {
    return this.tickets.issue(actor, dto);
  }

  /**
   * GET /api/stream?ticket=. @Public vì EventSource không gửi được Bearer; xác thực bằng ticket (GETDEL) + session còn sống.
   * Ticket chỉ dùng một lần nên EventSource tự kết nối lại sẽ nhận 401 và dừng; client phải xin ticket mới.
   */
  @Public()
  @Get("stream")
  async stream(@Query("ticket") ticketParam: string | undefined, @Res() res: Response): Promise<void> {
    const ticket = await this.tickets.redeem(typeof ticketParam === "string" ? ticketParam : undefined);
    if (!ticket) throw new UnauthorizedException();
    const session = await this.sessions.get(ticket.session_id);
    if (!session || session.user_id !== ticket.user_id) throw new UnauthorizedException();

    const conn = new SseConnection(res, ticket.user_id, ticket.session_id, ticket.participate);
    res.on("close", () => this.registry.close(conn, "CLIENT_CLOSED"));
    res.on("error", () => this.registry.close(conn, "PING_FAILED"));

    // Kết nối tham gia: INSERT stream_connections trước khi gửi header (lỗi DB ⇒ 500, không có participant "ma").
    await this.registry.open(conn);
    if (conn.closed) return;   // client đã đi trong lúc chờ DB

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");   // nginx không buffer
    res.flushHeaders();
    res.socket?.setKeepAlive(true, SOCKET_KEEPALIVE_MS);
    res.socket?.setNoDelay(true);
    res.socket?.setTimeout(0);

    // 1) Realtime trước, snapshot sau: tick đến trong lúc đọc snapshot không bị mất (client chống trùng / tick cũ theo ts).
    for (const itemId of ticket.items) {
      const unsub = this.hub.subscribe(itemId, (json) => {
        if (!conn.send(json)) this.registry.close(conn, "PING_FAILED");
      });
      conn.addCleanup(unsub);
    }

    // 2) Snapshot: tick cuối hub đã chấp nhận (không lùi phiên). Hub chưa có state (vừa restart) ⇒ latest:{key_id} của crawler
    //    (có thể là tick muộn; portal tự chặn theo vị trí).
    try {
      const missing: string[] = [];
      for (const itemId of ticket.items) {
        if (conn.closed) return;
        const snap = await this.hub.snapshot(itemId);
        if (snap === null) { missing.push(itemId); continue; }
        if (!conn.send(snap)) this.registry.close(conn, "PING_FAILED");
      }
      if (missing.length === 0) return;
      const snaps = await this.redis.mget(missing.map(RedisKeys.latest));
      for (let i = 0; i < snaps.length; i++) {
        const s = snaps[i];
        if (!s || conn.closed) continue;
        if (!conn.send(await this.hub.withStreamId(missing[i], s))) this.registry.close(conn, "PING_FAILED");
      }
    } catch (e) {
      this.log.warn(`SSE: không đọc được snapshot: ${e}`);
    }
  }
}
