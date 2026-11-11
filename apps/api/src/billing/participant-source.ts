// src/billing/participant-source.ts
// Ai đang tham gia (mở trang chi tiết) một stream. PR sau: RealtimeHub (connection registry trong RAM) cung cấp.
export const PARTICIPANT_SOURCE = Symbol("PARTICIPANT_SOURCE");

export interface ParticipantSource {
  /** user_id DISTINCT của các kết nối tham gia stream đang mở (nhiều tab của cùng user chỉ tính một lần). */
  participantUserIds(streamId: string): string[];
}

/** Tạm thời: chưa có kết nối tham gia nào nên không ai bị trừ tiền. */
export const noParticipants: ParticipantSource = { participantUserIds: () => [] };
