// src/billing/billing.service.ts
// Mọi thay đổi balance của luồng dự đoán đi qua file này (xem "Quy tắc bất biến về tiền" trong CLAUDE.md):
// - charge(): trừ tiền participant khi có prediction mới, chạy TRONG transaction đang insert prediction.
// - refund(): hoàn tiền một ván (dự đoán sai / kết quả T / ván CANCELLED), transaction riêng, idempotent nhờ refunded_at IS NULL.
//   HAS_REFUND=false ⇒ refund() không hoàn mà đánh dấu refund_waived_at (V12): subscription đó không bao giờ được hoàn nữa.
// Mọi phép tính trên balance / fee_amount làm trong SQL; TS chỉ chuyển chuỗi bigint qua lại, không cộng trừ.
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";
import { GameSessionStatus, type Role } from "@toolhackchain/shared";
import { updateReturning } from "../common/update-returning.js";
import type { EnvVars } from "../config/env.validation.js";
import { InsufficientBalanceException } from "./insufficient-balance.exception.js";

const USER_ROLE: Role = "USER";   // chỉ USER bị trừ tiền

export type ChargeRejectReason = "INSUFFICIENT_BALANCE" | "NOT_ALLOWED";   // NOT_ALLOWED: không ACTIVE / không phải USER / không tồn tại
export type ChargeOutcome = {
  charged: string[];                                           // user đã bị trừ và có subscription
  rejected: { userId: string; reason: ChargeRejectReason }[];  // participant không trừ được
  skipped: "NO_PARTICIPANTS" | "SESSION_NOT_RUNNING" | null;   // không trừ ai
};

@Injectable()
export class BillingService {
  constructor(@InjectDataSource() private ds: DataSource, private config: ConfigService<EnvVars, true>) {}

  /** HAS_REFUND (env, mặc định true): false ⇒ không hoàn tiền trong mọi trường hợp. */
  get refundEnabled(): boolean {
    return this.config.get("HAS_REFUND", { infer: true }) !== "false";
  }

  /** Phí hiện tại dưới dạng chuỗi số nguyên (truyền thẳng vào SQL ::bigint). */
  get fee(): string {
    return String(this.config.get("PREDICTION_FEE", { infer: true }));
  }

  /**
   * USER, ACTIVE và balance >= phí hiện tại (so sánh trong SQL, không đưa bigint qua TS). Dùng để cho vào trang chi tiết / cấp ticket tham gia.
   * Chỉ là cổng chặn sớm: việc trừ tiền vẫn kiểm tra lại điều kiện trong câu UPDATE của charge().
   */
  async canParticipate(userId: string): Promise<boolean> {
    const rows: { ok: boolean }[] = await this.ds.query(
      `SELECT (u.status = 'ACTIVE' AND r.role_name = $3 AND u.balance >= $2::bigint) AS ok
       FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = $1`,
      [userId, this.fee, USER_ROLE]);
    return rows[0]?.ok === true;
  }

  /** 402 INSUFFICIENT_BALANCE khi canParticipate() = false. */
  async assertCanParticipate(userId: string): Promise<void> {
    if (!(await this.canParticipate(userId))) throw new InsufficientBalanceException();
  }

  /**
   * Trừ tiền cho prediction VỪA được insert (caller đảm bảo: dòng mới + pick != null), trong transaction `m` của caller.
   * Ván phải còn RUNNING: khóa FOR SHARE dòng game_sessions để ingestion (FINISHED) / job hủy (CANCELLED) không đổi trạng thái
   * trước khi subscription commit — nếu không, settlement có thể chạy xong trước và khoản trừ sẽ không bao giờ được hoàn.
   */
  async charge(m: EntityManager, predictionId: string, gameSessionId: string, participantIds: string[]): Promise<ChargeOutcome> {
    const ids = [...new Set(participantIds)].sort();
    if (ids.length === 0) return { charged: [], rejected: [], skipped: "NO_PARTICIPANTS" };

    const ses: { status: string }[] = await m.query(
      `SELECT status FROM game_sessions WHERE game_session_id = $1 FOR SHARE`, [gameSessionId]);
    if (ses[0]?.status !== GameSessionStatus.RUNNING) return { charged: [], rejected: [], skipped: "SESSION_NOT_RUNNING" };

    const fee = this.fee;
    // Khóa user theo thứ tự user_id tăng dần (cùng thứ tự với refund) để tránh deadlock.
    await m.query(`SELECT user_id FROM users WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR UPDATE`, [ids]);

    const charged = await updateReturning<{ user_id: string; balance_before: string; balance_after: string }>(
      m,
      `UPDATE users SET balance = balance - $2::bigint
       WHERE user_id = ANY($1::uuid[]) AND balance >= $2::bigint AND status = 'ACTIVE'
         AND role_id = (SELECT role_id FROM roles WHERE role_name = $3)
       RETURNING user_id, balance + $2::bigint AS balance_before, balance AS balance_after`,
      [ids, fee, USER_ROLE]);

    if (charged.length > 0) {
      const subs: { prediction_subscription_id: string; user_id: string }[] = await m.query(
        `INSERT INTO prediction_subscriptions (user_id, prediction_id, fee_amount)
         SELECT u, $2, $3::bigint FROM unnest($1::uuid[]) AS u
         ON CONFLICT (user_id, prediction_id) DO NOTHING
         RETURNING prediction_subscription_id, user_id`,
        [charged.map((c) => c.user_id), predictionId, fee]);
      // Mỗi lần trừ phải có đúng một subscription mới; lệch nghĩa là đã trừ mà không ghi được → rollback cả transaction.
      if (subs.length !== charged.length) {
        throw new Error(`charge ${predictionId}: ${charged.length} user bị trừ nhưng chỉ tạo ${subs.length} subscription, rollback`);
      }
      const txs: unknown[] = await m.query(
        `INSERT INTO transactions (user_id, predictions_subscriptions_id, transaction_type, amount, balance_before, balance_after)
         SELECT c.user_id, s.prediction_subscription_id, 'CHARGE', $4::bigint, c.balance_before, c.balance_after
         FROM unnest($1::uuid[], $2::bigint[], $3::bigint[]) AS c(user_id, balance_before, balance_after)
         JOIN prediction_subscriptions s ON s.user_id = c.user_id AND s.prediction_id = $5
         RETURNING transaction_id`,
        [charged.map((c) => c.user_id), charged.map((c) => c.balance_before), charged.map((c) => c.balance_after), fee, predictionId]);
      if (txs.length !== charged.length) {
        throw new Error(`charge ${predictionId}: ${charged.length} user bị trừ nhưng ghi ${txs.length} transaction CHARGE, rollback`);
      }
    }

    const chargedIds = new Set(charged.map((c) => c.user_id));
    const rest = ids.filter((id) => !chargedIds.has(id));
    let rejected: ChargeOutcome["rejected"] = [];
    if (rest.length > 0) {
      const rows: { user_id: string; short: boolean }[] = await m.query(
        `SELECT u.user_id, (u.balance < $2::bigint) AS short
         FROM users u JOIN roles r ON r.role_id = u.role_id
         WHERE u.user_id = ANY($1::uuid[]) AND u.status = 'ACTIVE' AND r.role_name = $3`,
        [rest, fee, USER_ROLE]);
      const short = new Map(rows.map((r) => [r.user_id, r.short]));
      rejected = rest.map((userId) => ({ userId, reason: short.get(userId) ? "INSUFFICIENT_BALANCE" : "NOT_ALLOWED" }));
    }
    return { charged: [...chargedIds], rejected, skipped: null };
  }

  /**
   * Settlement một ván: subscription còn chờ quyết định (refunded_at IS NULL AND refund_waived_at IS NULL) của ván CANCELLED,
   * hoặc của ván FINISHED có result khác pick (kể cả T).
   * - HAS_REFUND=true: hoàn tiền (cả user đã DEACTIVE / DELETED).
   * - HAS_REFUND=false: KHÔNG hoàn, set refund_waived_at ⇒ không bao giờ được hoàn nữa, kể cả khi bật lại cờ. Không đổi balance.
   * Chạy lại bao nhiêu lần cũng không hoàn trùng. Trả số subscription vừa hoàn / vừa bỏ hoàn.
   */
  async refund(gameSessionId: string): Promise<{ refunded: number; waived: number }> {
    const enabled = this.refundEnabled;   // đọc một lần cho cả transaction
    return this.ds.transaction(async (m) => {
      const due: { sid: string; user_id: string }[] = await m.query(
        `SELECT ps.prediction_subscription_id AS sid, ps.user_id
         FROM prediction_subscriptions ps
         JOIN predictions p ON p.prediction_id = ps.prediction_id
         JOIN game_sessions g ON g.game_session_id = p.game_session_id
         WHERE p.game_session_id = $1 AND ps.refunded_at IS NULL AND ps.refund_waived_at IS NULL
           AND (g.status = $2 OR (g.status = $3 AND g.result IS NOT NULL AND g.result <> p.predict_result))
         FOR UPDATE OF ps`,
        [gameSessionId, GameSessionStatus.CANCELLED, GameSessionStatus.FINISHED]);
      if (due.length === 0) return { refunded: 0, waived: 0 };

      if (!enabled) {
        const waived = await updateReturning<{ sid: string }>(m,
          `UPDATE prediction_subscriptions SET refund_waived_at = now()
           WHERE prediction_subscription_id = ANY($1::uuid[]) AND refunded_at IS NULL AND refund_waived_at IS NULL
           RETURNING prediction_subscription_id AS sid`,
          [due.map((d) => d.sid)]);
        return { refunded: 0, waived: waived.length };
      }

      const userIds = [...new Set(due.map((d) => d.user_id))].sort();
      await m.query(`SELECT user_id FROM users WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR UPDATE`, [userIds]);

      // Một ván có đúng một prediction và UNIQUE (user_id, prediction_id) ⇒ mỗi user tối đa một dòng: không cần gộp theo user.
      const rows: unknown[] = await m.query(
        `-- top-level: INSERT (rows trả về bình thường, không dùng updateReturning)
         WITH marked AS (
           UPDATE prediction_subscriptions ps SET refunded_at = now()
           WHERE ps.prediction_subscription_id = ANY($1::uuid[]) AND ps.refunded_at IS NULL AND ps.refund_waived_at IS NULL
           RETURNING ps.prediction_subscription_id AS sid, ps.user_id, ps.fee_amount AS fee
         ), credited AS (
           UPDATE users u SET balance = u.balance + marked.fee
           FROM marked WHERE u.user_id = marked.user_id
           RETURNING u.user_id, marked.sid, marked.fee, u.balance - marked.fee AS balance_before, u.balance AS balance_after
         )
         INSERT INTO transactions (user_id, predictions_subscriptions_id, transaction_type, amount, balance_before, balance_after)
         SELECT user_id, sid, 'REFUND', fee, balance_before, balance_after FROM credited
         RETURNING transaction_id`,
        [due.map((d) => d.sid)]);
      if (rows.length !== due.length) {
        throw new Error(`refund ${gameSessionId}: cần hoàn ${due.length} subscription nhưng ghi ${rows.length} REFUND, rollback`);
      }
      return { refunded: rows.length, waived: 0 };
    });
  }
}
