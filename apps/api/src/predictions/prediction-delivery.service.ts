// src/predictions/prediction-delivery.service.ts
// Giao prediction SAU KHI transaction (insert + trừ tiền) đã commit. Lọc ở server:
// - pick != null: chỉ gửi cho user có prediction_subscriptions (đã trừ tiền) — đọc từ DB nên xử lý lại message vẫn giao đúng người.
// - pick = null: gửi cho mọi kết nối tham gia của stream (không ai bị trừ).
// delivered_at là best effort: chỉ nghĩa là đã ghi được lên ít nhất một kết nối của user.
import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import type { RealtimeInsufficientBalance, RealtimePrediction } from "@toolhackchain/shared";
import type { ChargeOutcome } from "../billing/billing.service.js";
import { ConnectionRegistry } from "../realtime/connection-registry.js";

@Injectable()
export class PredictionDeliveryService {
  private readonly log = new Logger(PredictionDeliveryService.name);

  constructor(@InjectDataSource() private ds: DataSource, private registry: ConnectionRegistry) {}

  /** pick = null: gửi cho mọi participant. Trả số kết nối đã ghi. */
  deliverUnpaid(event: RealtimePrediction): number {
    return this.registry.sendToParticipants(event.stream_id, JSON.stringify(event));
  }

  /**
   * Gửi pick cho các subscription chưa giao (delivered_at IS NULL) của prediction này, rồi set delivered_at cho user đã ghi được.
   * Lỗi SELECT ném ra (consumer thử lại từ PEL và giao lại); lỗi UPDATE delivered_at chỉ log (đã gửi rồi, không gửi lặp).
   */
  async deliverPaid(predictionId: string, event: RealtimePrediction): Promise<{ due: number; delivered: number }> {
    const rows: { user_id: string }[] = await this.ds.query(
      `SELECT user_id FROM prediction_subscriptions WHERE prediction_id = $1 AND delivered_at IS NULL`, [predictionId]);
    if (rows.length === 0) return { due: 0, delivered: 0 };
    const delivered = this.registry.sendToUsers(event.stream_id, rows.map((r) => r.user_id), JSON.stringify(event));
    if (delivered.size > 0) {
      try {
        await this.ds.query(
          `UPDATE prediction_subscriptions SET delivered_at = now()
           WHERE prediction_id = $1 AND user_id = ANY($2::uuid[]) AND delivered_at IS NULL`,
          [predictionId, [...delivered]]);
      } catch (e) {
        this.log.warn(`Không ghi được delivered_at của prediction ${predictionId}: ${e}`);
      }
    }
    return { due: rows.length, delivered: delivered.size };
  }

  /**
   * Participant không trừ được ở ván này: INSUFFICIENT_BALANCE ⇒ gửi event insufficient_balance rồi đóng;
   * NOT_ALLOWED (không còn ACTIVE / không phải USER) ⇒ đóng SESSION_REVOKED.
   */
  closeRejected(streamId: string, rejected: ChargeOutcome["rejected"]): void {
    const poor = rejected.filter((r) => r.reason === "INSUFFICIENT_BALANCE").map((r) => r.userId);
    const banned = rejected.filter((r) => r.reason === "NOT_ALLOWED").map((r) => r.userId);
    if (poor.length > 0) {
      const ev: RealtimeInsufficientBalance = { type: "insufficient_balance", stream_id: streamId, ts: Date.now() / 1000 };
      this.registry.closeUsers(streamId, poor, "INSUFFICIENT_BALANCE", JSON.stringify(ev));
    }
    if (banned.length > 0) this.registry.closeUsers(streamId, banned, "SESSION_REVOKED");
  }
}
