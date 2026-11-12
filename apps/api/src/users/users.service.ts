// src/users/users.service.ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import argon2 from "argon2";
import { DataSource, QueryFailedError } from "typeorm";
import { UserStatus } from "@toolhackchain/shared";
import type { AuthUser } from "../auth/auth.types.js";
import { updateReturning } from "../common/update-returning.js";
import { ARGON2_OPTIONS } from "../auth/password.js";
import { PermissionService } from "../auth/permission.service.js";
import { SessionService } from "../auth/session.service.js";
import { RoleEntity, UserEntity } from "../database/entities/index.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";
import type { UpdateUserDto } from "./dto/update-user.dto.js";

const UNIQUE_VIOLATION = "23505";

@Injectable()
export class UsersService {
  private readonly log = new Logger(UsersService.name);

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private permissions: PermissionService,
    private sessions: SessionService,
  ) {}

  // HOST tạo ADMIN, ADMIN tạo USER; cấp trên (refer_user_id) luôn là người gọi.
  async create(actor: AuthUser, dto: CreateUserDto) {
    const role = this.permissions.managedRole(actor.role);
    if (!role) throw new ForbiddenException();

    const roleRow = await this.dataSource.getRepository(RoleEntity).findOneBy({ roleName: role });
    if (!roleRow) throw new Error(`Role ${role} is not seeded`);

    const password = await argon2.hash(dto.password, ARGON2_OPTIONS);
    try {
      const result = await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(UserEntity)
        .values({
          phoneNumber: dto.phone_number,
          displayName: dto.display_name ?? null,
          password,
          roleId: roleRow.roleId,
          referUserId: actor.userId,
          status: UserStatus.ACTIVE,
        })
        .execute();

      const userId = String(result.identifiers[0].userId);
      this.log.log(`user created actor=${actor.userId} target=${userId} role=${role}`);
      return { user_id: userId, phone_number: dto.phone_number, display_name: dto.display_name ?? null, role, status: UserStatus.ACTIVE, refer_user_id: actor.userId };
    } catch (e) {
      if (e instanceof QueryFailedError && (e.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION) {
        throw new ConflictException("Phone number already exists");
      }
      throw e;
    }
  }

  /** Đổi số điện thoại / tên hiển thị / mật khẩu của cấp dưới TRỰC TIẾP (cha → con). Cháu, cha, chính mình ⇒ 403. Đổi mật khẩu thu hồi mọi phiên của target. */
  async update(actor: AuthUser, targetUserId: string, dto: UpdateUserDto) {
    if (dto.phone_number === undefined && dto.password === undefined && dto.display_name === undefined) throw new BadRequestException("Nothing to update");
    const target = await this.permissions.assertCanManage(actor, targetUserId);
    if (target.status === UserStatus.DELETED) throw new ConflictException("User is deleted");

    const set: { phoneNumber?: string; password?: string; displayName?: string | null } = {};
    if (dto.display_name !== undefined) set.displayName = dto.display_name;
    if (dto.phone_number !== undefined) set.phoneNumber = dto.phone_number;
    if (dto.password !== undefined) set.password = await argon2.hash(dto.password, ARGON2_OPTIONS);
    try {
      await this.dataSource.createQueryBuilder().update(UserEntity).set(set).where("user_id = :userId", { userId: target.userId }).execute();
    } catch (e) {
      if (e instanceof QueryFailedError && (e.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION) {
        throw new ConflictException("Phone number already exists");
      }
      throw e;
    }

    if (set.password) await this.sessions.revokeAllSessions(target.userId);
    this.log.log(`user updated actor=${actor.userId} target=${target.userId} fields=${Object.keys(set).join(",")}`);
    return { user_id: target.userId, ...(dto.phone_number !== undefined ? { phone_number: dto.phone_number } : {}) };
  }

  async updateStatus(actor: AuthUser, targetUserId: string, status: UserStatus, transferToAdminId?: string) {
    const target = await this.permissions.assertCanManage(actor, targetUserId);
    if (target.status === UserStatus.DELETED) throw new ConflictException("User is deleted");
    if (status === UserStatus.DELETED) return this.remove(actor, target.userId, transferToAdminId);
    if (transferToAdminId !== undefined) throw new BadRequestException("transfer_to_admin_id is only for deleting an admin");

    await this.dataSource
      .createQueryBuilder()
      .update(UserEntity)
      .set({ status })
      .where("user_id = :userId", { userId: target.userId })
      .execute();

    if (status !== UserStatus.ACTIVE) await this.sessions.revokeAllSessions(target.userId);
    this.log.log(`status changed actor=${actor.userId} target=${target.userId} ${target.status}->${status}`);
    return { user_id: target.userId, status };
  }

  /**
   * Xóa mềm cấp dưới TRỰC TIẾP (HOST → ADMIN, ADMIN → USER; caller đã kiểm tra bằng assertCanManage). Điều kiện: target đang DEACTIVE
   * (409 nếu còn ACTIVE). Một DB transaction, khóa users theo user_id tăng dần, tính trong SQL:
   * - Điểm còn lại của target được THU HỒI về actor: hai dòng transactions loại `INVOKE` (target giảm, actor tăng), created_by = actor.
   * - ADMIN xóa USER: không nhận `transferToAdminId`; USER không có cấp dưới nên không phải chuyển gì.
   * - HOST xóa ADMIN: nếu ADMIN còn cấp dưới chưa xóa thì BẮT BUỘC `transferToAdminId` (ADMIN khác, ACTIVE, con trực tiếp của HOST), thiếu ⇒ 409
   *   `{ code: "TRANSFER_REQUIRED" }`; các cấp dưới đó được chuyển `refer_user_id` sang ADMIN đó. Không còn cấp dưới thì xóa luôn, không cần chọn.
   * Sau commit thu hồi mọi phiên của target (portal gọi /auth/me sẽ bị 401).
   */
  private async remove(actor: AuthUser, targetUserId: string, transferToAdminId?: string) {
    if (actor.role === "HOST") {
      if (transferToAdminId === targetUserId) throw new BadRequestException("transfer_to_admin_id must be a different admin");
    } else if (transferToAdminId !== undefined) {
      throw new BadRequestException("transfer_to_admin_id is only for deleting an admin");
    }

    const result = await this.dataSource.transaction(async (m) => {
      const ids = [actor.userId, targetUserId, ...(transferToAdminId ? [transferToAdminId] : [])];
      const locked = await m.query(
        `SELECT u.user_id, u.status, u.refer_user_id, u.balance::text AS balance, r.role_name AS role
         FROM users u JOIN roles r ON r.role_id = u.role_id
         WHERE u.user_id = ANY($1::uuid[]) ORDER BY u.user_id FOR UPDATE OF u`,
        [ids],
      ) as { user_id: string; status: string; refer_user_id: string | null; balance: string; role: string }[];
      const target = locked.find((r) => r.user_id === targetUserId);
      if (!target || target.refer_user_id !== actor.userId) throw new ForbiddenException();
      if (target.status === UserStatus.DELETED) throw new ConflictException("User is deleted");
      if (target.status !== UserStatus.DEACTIVE) throw new ConflictException("Chỉ được xóa người dùng đã deactive");

      if (transferToAdminId) {
        const heir = locked.find((r) => r.user_id === transferToAdminId);
        if (!heir || heir.refer_user_id !== actor.userId || heir.role !== "ADMIN" || heir.status !== UserStatus.ACTIVE) {
          throw new ForbiddenException("Admin nhận bàn giao phải là Admin đang hoạt động thuộc quyền quản lý của bạn");
        }
        await m.query(`UPDATE users SET refer_user_id = $2 WHERE refer_user_id = $1 AND status <> 'DELETED'`, [targetUserId, transferToAdminId]);
      } else {
        const [child] = await m.query(`SELECT 1 FROM users WHERE refer_user_id = $1 AND status <> 'DELETED' LIMIT 1`, [targetUserId]) as unknown[];
        if (child && actor.role === "HOST") throw new ConflictException({ code: "TRANSFER_REQUIRED", message: "Admin còn người dùng, cần chọn Admin nhận bàn giao" });
        if (child) throw new ConflictException("Người dùng còn cấp dưới chưa xóa");
      }

      const amount = target.balance;
      if (amount !== "0") {
        const [out] = await updateReturning<{ balance_before: string; balance_after: string }>(
          m,
          `UPDATE users SET balance = balance - $2::bigint WHERE user_id = $1 AND balance >= $2::bigint
           RETURNING (balance + $2::bigint)::text AS balance_before, balance::text AS balance_after`,
          [targetUserId, amount],
        );
        if (!out) throw new ConflictException("Balance changed, please retry");
        const [inc] = await updateReturning<{ balance_before: string; balance_after: string }>(
          m,
          `UPDATE users SET balance = balance + $2::bigint WHERE user_id = $1
           RETURNING (balance - $2::bigint)::text AS balance_before, balance::text AS balance_after`,
          [actor.userId, amount],
        );
        await m.query(
          `INSERT INTO transactions (user_id, transaction_type, amount, balance_before, balance_after, created_by)
           VALUES ($1, 'INVOKE', $3::bigint, $4::bigint, $5::bigint, $2),
                  ($2, 'INVOKE', $3::bigint, $6::bigint, $7::bigint, $2)`,
          [targetUserId, actor.userId, amount, out.balance_before, out.balance_after, inc.balance_before, inc.balance_after],
        );
      }
      await m.query(`UPDATE users SET status = 'DELETED' WHERE user_id = $1`, [targetUserId]);
      return { user_id: targetUserId, status: UserStatus.DELETED, returned_points: amount, transferred_to: transferToAdminId ?? null };
    });

    await this.sessions.revokeAllSessions(targetUserId);
    this.log.log(`user deleted actor=${actor.userId} target=${targetUserId} returned=${result.returned_points} heir=${transferToAdminId ?? "-"}`);
    return result;
  }

  /**
   * Cấp điểm (chỉ cộng) cho cấp dưới TRỰC TIẾP: HOST sinh mới cho ADMIN (MINT); ADMIN chuyển từ balance của mình cho USER
   * (TRANSFER_OUT + TRANSFER_IN). Cháu, cha, chính mình, user không ACTIVE ⇒ 403. Một DB transaction, khóa users theo user_id tăng dần.
   */
  async grantPoints(actor: AuthUser, targetUserId: string, amount: number) {
    try {
      await this.permissions.assertCanGrantPoints(actor, targetUserId);
    } catch (e) {
      if (e instanceof ForbiddenException) throw new ForbiddenException("Chỉ được cấp điểm cho cấp dưới trực tiếp đang hoạt động");
      throw e;
    }

    const fee = String(amount);
    const result = await this.dataSource.transaction(async (m) => {
      const ids = actor.role === "ADMIN" ? [actor.userId, targetUserId] : [targetUserId];
      const locked = await m.query(
        `SELECT user_id, status, refer_user_id FROM users WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR UPDATE`,
        [ids],
      ) as { user_id: string; status: string; refer_user_id: string | null }[];
      const target = locked.find((r) => r.user_id === targetUserId);
      if (!target || target.status !== UserStatus.ACTIVE || target.refer_user_id !== actor.userId) {
        throw new ForbiddenException("Chỉ được cấp điểm cho cấp dưới trực tiếp đang hoạt động");
      }

      let actorAfter: string | null = null;
      if (actor.role === "ADMIN") {
        const [out] = await updateReturning<{ balance_before: string; balance_after: string }>(
          m,
          `UPDATE users SET balance = balance - $2::bigint WHERE user_id = $1 AND balance >= $2::bigint
           RETURNING (balance + $2::bigint)::text AS balance_before, balance::text AS balance_after`,
          [actor.userId, fee],
        );
        if (!out) throw new BadRequestException({ code: "INSUFFICIENT_BALANCE", message: "Không đủ điểm để cấp" });
        actorAfter = out.balance_after;
        await m.query(
          `INSERT INTO transactions (user_id, transaction_type, amount, balance_before, balance_after, created_by)
           VALUES ($1, 'TRANSFER_OUT', $2::bigint, $3::bigint, $4::bigint, $1)`,
          [actor.userId, fee, out.balance_before, out.balance_after],
        );
      }

      const [inc] = await updateReturning<{ balance_before: string; balance_after: string }>(
        m,
        `UPDATE users SET balance = balance + $2::bigint WHERE user_id = $1
         RETURNING (balance - $2::bigint)::text AS balance_before, balance::text AS balance_after`,
        [targetUserId, fee],
      );
      await m.query(
        `INSERT INTO transactions (user_id, transaction_type, amount, balance_before, balance_after, created_by)
         VALUES ($1, $5, $2::bigint, $3::bigint, $4::bigint, $6)`,
        [targetUserId, fee, inc.balance_before, inc.balance_after, actor.role === "ADMIN" ? "TRANSFER_IN" : "MINT", actor.userId],
      );
      return { user_id: targetUserId, amount: fee, balance: inc.balance_after, actor_balance: actorAfter };
    });

    this.log.log(`points granted actor=${actor.userId} target=${targetUserId} amount=${fee}`);
    return result;
  }
}
