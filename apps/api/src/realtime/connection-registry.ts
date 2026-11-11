// src/realtime/connection-registry.ts
// Registry các kết nối SSE trong RAM (API chạy MỘT instance). Kết nối tham gia (participate) là participant của stream:
// bị trừ tiền cho mỗi dự đoán có pick và là nơi DUY NHẤT nhận pick của ván đang chạy.
// Mỗi kết nối tham gia một dòng stream_connections: INSERT lúc mở, UPDATE đúng một lần lúc đóng (closed_at, close_reason, last_ping_at).
import {
  BeforeApplicationShutdown, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { Redis } from "ioredis";
import { RedisKeys, SSE_PING_INTERVAL_MS } from "@toolhackchain/shared";
import type { StreamCloseReason } from "../database/entities/index.js";
import { SessionService } from "../auth/session.service.js";
import { REDIS } from "../redis/redis.module.js";
import type { SseConnection } from "./sse-connection.js";

const PING_CHUNK = "event: ping\ndata: \n\n";

@Injectable()
export class ConnectionRegistry implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  private readonly log = new Logger(ConnectionRegistry.name);
  private all = new Set<SseConnection>();
  private byStream = new Map<string, Set<SseConnection>>();   // stream_id -> kết nối tham gia
  private pendingWrites = new Set<Promise<void>>();
  private timer?: NodeJS.Timeout;
  private pinging = false;

  constructor(
    @InjectDataSource() private ds: DataSource,
    @Inject(REDIS) private redis: Redis,
    private sessions: SessionService,
  ) {}

  /** Lúc khởi động: mọi dòng còn mở là của lần chạy trước (một instance) ⇒ đóng với SERVER_RESTART. */
  async onModuleInit() {
    try {
      const res: [unknown[], number] = await this.ds.query(
        `UPDATE stream_connections SET closed_at = now(), close_reason = 'SERVER_RESTART' WHERE closed_at IS NULL`);
      const count = Array.isArray(res) ? res[1] : 0;
      if (count > 0) this.log.warn(`Đóng ${count} stream_connections còn mở từ lần chạy trước (SERVER_RESTART)`);
    } catch (e) {
      this.log.error(`Không đóng được stream_connections cũ: ${e}`);
    }
    this.timer = setInterval(() => void this.pingAll(), SSE_PING_INTERVAL_MS);
    // Đăng xuất / user bị khóa: ngắt kết nối ngay, không chờ lượt ping kế tiếp (participant vẫn bị trừ tiền nếu còn mở).
    this.sessions.onRevoked((sessionId) => this.closeSession(sessionId));
  }

  /** Đóng mọi kết nối (tham gia và chỉ nghe) của một session với SESSION_REVOKED. */
  closeSession(sessionId: string): void {
    for (const conn of [...this.all]) {
      if (conn.sessionId === sessionId) this.close(conn, "SESSION_REVOKED");
    }
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Tắt có kiểm soát: đóng mọi kết nối với SERVER_SHUTDOWN (DB vẫn còn ở hook này) và chờ các câu UPDATE xong. */
  async beforeApplicationShutdown() {
    clearInterval(this.timer);
    const rows: { id: string; lastPingAt: Date | null }[] = [];
    for (const conn of [...this.all]) {
      this.closeInternal(conn, "SERVER_SHUTDOWN", null, false);
      if (conn.streamConnectionId) rows.push({ id: conn.streamConnectionId, lastPingAt: conn.lastPingAt });
    }
    if (rows.length > 0) {
      try {
        await this.ds.query(
          `UPDATE stream_connections sc
           SET closed_at = now(), close_reason = 'SERVER_SHUTDOWN', last_ping_at = v.last_ping_at
           FROM unnest($1::uuid[], $2::timestamptz[]) AS v(id, last_ping_at)
           WHERE sc.stream_connection_id = v.id AND sc.closed_at IS NULL`,
          [rows.map((r) => r.id), rows.map((r) => r.lastPingAt)]);
      } catch (e) {
        this.log.error(`Không ghi được SERVER_SHUTDOWN cho ${rows.length} stream_connections: ${e}`);
      }
    }
    await Promise.allSettled([...this.pendingWrites]);
  }

  /**
   * Đăng ký kết nối. Kết nối tham gia: INSERT stream_connections trước (lỗi DB ⇒ ném, caller trả lỗi trước khi gửi header).
   * Client đóng trong lúc chờ INSERT ⇒ close() đã chạy khi streamConnectionId còn null, nên ghi dòng đóng ở đây.
   */
  async open(conn: SseConnection): Promise<void> {
    if (conn.participate) {
      const rows: { stream_connection_id: string }[] = await this.ds.query(
        `INSERT INTO stream_connections (user_id, stream_id) VALUES ($1, $2) RETURNING stream_connection_id`,
        [conn.userId, conn.participate.streamId]);
      conn.streamConnectionId = rows[0].stream_connection_id;
      if (conn.closed) {
        this.persistClose(conn);
        return;
      }
      let set = this.byStream.get(conn.participate.streamId);
      if (!set) this.byStream.set(conn.participate.streamId, (set = new Set()));
      set.add(conn);
    }
    if (!conn.closed) this.all.add(conn);
  }

  /** Đóng kết nối (mọi lý do). Idempotent: chỉ lần đầu có tác dụng. finalEventJson được gửi ngay trước khi đóng. */
  close(conn: SseConnection, reason: StreamCloseReason, finalEventJson: string | null = null): void {
    this.closeInternal(conn, reason, finalEventJson, true);
  }

  private closeInternal(conn: SseConnection, reason: StreamCloseReason, finalEventJson: string | null, persist: boolean): void {
    if (conn.closed) return;
    if (finalEventJson) conn.send(finalEventJson);
    conn.closed = true;
    conn.closeReason = reason;
    this.all.delete(conn);
    if (conn.participate) {
      const set = this.byStream.get(conn.participate.streamId);
      set?.delete(conn);
      if (set?.size === 0) this.byStream.delete(conn.participate.streamId);
    }
    conn.runCleanups();
    try { if (!conn.res.writableEnded) conn.res.end(); } catch { /* socket đã chết */ }
    if (persist) this.persistClose(conn);
  }

  private persistClose(conn: SseConnection): void {
    if (!conn.streamConnectionId) return;   // chưa INSERT xong: open() sẽ gọi lại
    const p = this.ds.query(
      `UPDATE stream_connections SET closed_at = now(), close_reason = $2, last_ping_at = $3
       WHERE stream_connection_id = $1 AND closed_at IS NULL`,
      [conn.streamConnectionId, conn.closeReason, conn.lastPingAt],
    ).then(() => undefined, (e: unknown) => {
      this.log.error(`Không ghi được close của stream_connection ${conn.streamConnectionId} (${conn.closeReason}): ${e}`);
    });
    this.pendingWrites.add(p);
    void p.finally(() => this.pendingWrites.delete(p));
  }

  /** user_id DISTINCT của các kết nối tham gia stream đang mở (nhiều tab của cùng user chỉ tính một lần). */
  participantUserIds(streamId: string): string[] {
    const set = this.byStream.get(streamId);
    if (!set) return [];
    return [...new Set([...set].filter((c) => !c.closed).map((c) => c.userId))];
  }

  /** Gửi event cho mọi tab tham gia stream của các user này. Trả user_id đã ghi thành công ít nhất một kết nối. */
  sendToUsers(streamId: string, userIds: Iterable<string>, json: string): Set<string> {
    const wanted = new Set(userIds);
    const delivered = new Set<string>();
    for (const conn of [...(this.byStream.get(streamId) ?? [])]) {
      if (!wanted.has(conn.userId)) continue;
      if (conn.send(json)) delivered.add(conn.userId);
      else this.close(conn, "PING_FAILED");
    }
    return delivered;
  }

  /** Gửi event cho mọi kết nối tham gia stream. Trả số kết nối ghi thành công. */
  sendToParticipants(streamId: string, json: string): number {
    let n = 0;
    for (const conn of [...(this.byStream.get(streamId) ?? [])]) {
      if (conn.send(json)) n++;
      else this.close(conn, "PING_FAILED");
    }
    return n;
  }

  /** Đóng mọi kết nối tham gia stream của các user này. Trả số kết nối đã đóng. */
  closeUsers(streamId: string, userIds: Iterable<string>, reason: StreamCloseReason, finalEventJson: string | null = null): number {
    const wanted = new Set(userIds);
    let n = 0;
    for (const conn of [...(this.byStream.get(streamId) ?? [])]) {
      if (!wanted.has(conn.userId)) continue;
      this.close(conn, reason, finalEventJson);
      n++;
    }
    return n;
  }

  /**
   * Mỗi SSE_PING_INTERVAL_MS: (1) session bị thu hồi (session:{sid} không còn) ⇒ SESSION_REVOKED;
   * (2) ghi ping, lỗi / buffer quá đầy ⇒ PING_FAILED, thành công ⇒ lastPingAt (chỉ RAM).
   * Ghi thành công chỉ nghĩa là kernel / proxy đã nhận, không chắc tab còn sống (đã chấp nhận: tab nền vẫn bị trừ).
   */
  private async pingAll(): Promise<void> {
    if (this.pinging || this.all.size === 0) return;
    this.pinging = true;
    try {
      const sids = [...new Set([...this.all].map((c) => c.sessionId))];
      // Chỉ coi là bị thu hồi khi Redis trả lời chắc chắn "không tồn tại"; lỗi Redis thì không đóng nhầm.
      const revoked = new Set<string>();
      try {
        const pipe = this.redis.pipeline();
        for (const sid of sids) pipe.exists(RedisKeys.session(sid));
        const res = (await pipe.exec()) ?? [];
        sids.forEach((sid, i) => { if (res[i] && !res[i][0] && res[i][1] === 0) revoked.add(sid); });
      } catch (e) {
        this.log.warn(`Không kiểm tra được session của kết nối SSE: ${e}`);
      }
      const now = new Date();
      for (const conn of [...this.all]) {
        if (revoked.has(conn.sessionId)) { this.close(conn, "SESSION_REVOKED"); continue; }
        if (conn.write(PING_CHUNK)) conn.lastPingAt = now;
        else this.close(conn, "PING_FAILED");
      }
    } finally {
      this.pinging = false;
    }
  }
}
