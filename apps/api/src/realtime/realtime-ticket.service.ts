// src/realtime/realtime-ticket.service.ts
// Ticket một lần cho SSE (EventSource không gửi được Authorization; tuyệt đối không đưa access token lên query string).
// POST /api/realtime/ticket (đã qua SessionGuard) → Redis sse_ticket:{ticket} TTL 30s → GET /api/stream?ticket= đọc bằng GETDEL.
import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { Redis } from "ioredis";
import { buildKeyId, RedisKeys, SSE_TICKET_TTL_SECONDS, type Role } from "@toolhackchain/shared";
import type { AuthUser } from "../auth/auth.types.js";
import { BillingService } from "../billing/billing.service.js";
import { REDIS } from "../redis/redis.module.js";
import { StreamsService } from "../streams/streams.service.js";
import type { SseTicketDto } from "./dto/sse-ticket.dto.js";
import { TICKET_PATTERN } from "./realtime.constants.js";
import type { Participation } from "./sse-connection.js";

const USER_ROLE: Role = "USER";

export type SseTicket = {
  user_id: string;
  session_id: string;
  items: string[];                     // key_id nhận tick
  participate: Participation | null;   // chỉ trang chi tiết
};

@Injectable()
export class RealtimeTicketService {
  constructor(
    @Inject(REDIS) private redis: Redis,
    private streams: StreamsService,
    private billing: BillingService,
  ) {}

  /**
   * items: USER chỉ nhận key_id của stream ACTIVE (có category + lobby cha ACTIVE), key_id khác bị bỏ; không còn item hợp lệ
   * (và không tham gia stream nào) ⇒ 403. HOST / ADMIN thấy tất cả.
   * participate_stream_id: chỉ USER (HOST / ADMIN ⇒ 403), stream trong phạm vi nhìn thấy (404), đủ điểm (402 INSUFFICIENT_BALANCE).
   * key_id của stream tham gia luôn được thêm vào items.
   */
  async issue(actor: AuthUser, dto: SseTicketDto): Promise<{ ticket: string; expires_in: number }> {
    const requested = [...new Set(dto.items.map((s) => s.trim()).filter(Boolean))];
    const items = new Set(actor.role === USER_ROLE ? await this.streams.visibleKeyIds(requested) : requested);
    let participate: Participation | null = null;
    if (dto.participate_stream_id) {
      if (actor.role !== USER_ROLE) throw new ForbiddenException();
      const stream = await this.streams.getOne(actor.role, dto.participate_stream_id);
      await this.billing.assertCanParticipate(actor.userId);
      const keyId = buildKeyId(stream.lobby_name, stream.category_name, stream.stream_name);
      participate = { streamId: stream.stream_id, keyId };
      items.add(keyId);
    }
    if (items.size === 0) {
      if (requested.length > 0) throw new ForbiddenException();
      throw new BadRequestException("items hoặc participate_stream_id là bắt buộc");
    }

    const ticket = randomBytes(24).toString("base64url");
    const value: SseTicket = { user_id: actor.userId, session_id: actor.sessionId, items: [...items], participate };
    await this.redis.set(RedisKeys.sseTicket(ticket), JSON.stringify(value), "EX", SSE_TICKET_TTL_SECONDS);
    return { ticket, expires_in: SSE_TICKET_TTL_SECONDS };
  }

  /** Đọc và xóa ticket (dùng đúng một lần). null khi sai định dạng / hết hạn / đã dùng. */
  async redeem(ticket: string | undefined): Promise<SseTicket | null> {
    if (!ticket || !TICKET_PATTERN.test(ticket)) return null;
    const raw = await this.redis.getdel(RedisKeys.sseTicket(ticket));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SseTicket;
    } catch {
      return null;
    }
  }
}
