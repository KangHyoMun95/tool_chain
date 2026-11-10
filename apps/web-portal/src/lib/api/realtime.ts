// Ticket một lần cho SSE (POST /realtime/ticket, TTL 30s). EventSource không gửi được Bearer nên mở /stream?ticket=.
import { apiPost } from "./client";

export type TicketRequest = {
  /** key_id chỉ nhận tick (không bị trừ tiền). */
  items?: string[];
  /** Trang chi tiết: tham gia stream (bị trừ tiền mỗi dự đoán; 402 INSUFFICIENT_BALANCE khi không đủ điểm). */
  participateStreamId?: string;
};

export const requestSseTicket = async ({ items, participateStreamId }: TicketRequest): Promise<string> =>
  (await apiPost<{ ticket: string }>("/realtime/ticket", {
    ...(items?.length ? { items } : {}),
    ...(participateStreamId ? { participate_stream_id: participateStreamId } : {}),
  })).ticket;
