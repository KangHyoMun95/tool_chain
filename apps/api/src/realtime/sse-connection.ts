// src/realtime/sse-connection.ts
// Một kết nối SSE (ghi tay lên Response của express). Chỉ ConnectionRegistry được đóng kết nối (để ghi stream_connections đúng một lần).
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { StreamCloseReason } from "../database/entities/index.js";
import { SSE_MAX_BUFFERED_BYTES } from "./realtime.constants.js";

export type Participation = { streamId: string; keyId: string };

export class SseConnection {
  readonly id = randomUUID();
  readonly openedAt = new Date();
  lastPingAt: Date | null = null;          // chỉ trong RAM; ghi xuống DB một lần lúc đóng
  streamConnectionId: string | null = null; // dòng stream_connections (chỉ kết nối tham gia)
  closed = false;
  closeReason: StreamCloseReason | null = null;
  private cleanups: (() => void)[] = [];

  constructor(
    readonly res: Response,
    readonly userId: string,
    readonly sessionId: string,
    readonly participate: Participation | null,
  ) {}

  /** Ghi một khối SSE thô. false khi kết nối đã đóng / hỏng / buffer quá đầy (caller đóng kết nối). */
  write(chunk: string): boolean {
    const res = this.res;
    if (this.closed || res.writableEnded || res.destroyed || !res.writable) return false;
    if (res.writableLength > SSE_MAX_BUFFERED_BYTES) return false;
    try {
      res.write(chunk);   // false = đang có backpressure (đã buffer), không phải lỗi
      return true;
    } catch {
      return false;
    }
  }

  /** Event mặc định (message) với data là JSON một dòng. */
  send(json: string): boolean {
    return this.write(`data: ${json}\n\n`);
  }

  /** Chạy khi kết nối đóng (đã đóng thì chạy ngay). */
  addCleanup(fn: () => void): void {
    if (this.closed) fn();
    else this.cleanups.push(fn);
  }

  runCleanups(): void {
    const fns = this.cleanups;
    this.cleanups = [];
    for (const fn of fns) {
      try { fn(); } catch { /* bỏ qua */ }
    }
  }
}
