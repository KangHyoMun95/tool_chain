// src/users-register/users-register.service.ts
import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import argon2 from "argon2";
import { QueryFailedError, type DataSource } from "typeorm";
import { UserStatus } from "@toolhackchain/shared";
import type { AuthUser } from "../auth/auth.types.js";
import { ARGON2_OPTIONS } from "../auth/password.js";
import { PermissionService } from "../auth/permission.service.js";
import { updateReturning } from "../common/update-returning.js";
import { RoleEntity } from "../database/entities/index.js";
import type { ActivateRegisterDto } from "./dto/activate-register.dto.js";

const UNIQUE_VIOLATION = "23505";

@Injectable()
export class UsersRegisterService {
  private readonly log = new Logger(UsersRegisterService.name);

  constructor(
    @InjectDataSource() private ds: DataSource,
    private permissions: PermissionService,
  ) {}

  /**
   * Ghi số điện thoại chờ cấp tài khoản. Idempotent: đã đăng ký rồi, hoặc đã là user, thì không làm gì.
   * Caller luôn trả cùng một kết quả cho cả ba trường hợp để endpoint công khai này không bị dùng
   * dò xem số nào đã có trong hệ thống.
   */
  async register(phoneNumber: string): Promise<void> {
    await this.ds.query(
      `INSERT INTO users_register (phone_number, created_at)
       SELECT $1::varchar, now() WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone_number = $1::varchar)
       ON CONFLICT (phone_number) DO NOTHING`,
      [phoneNumber],
    );
  }

  /** HOST: số điện thoại chờ cấp tài khoản, mới đăng ký trước (dòng cũ không có ngày xuống cuối). */
  async list(page: number, limit: number) {
    const [items, count] = await Promise.all([
      this.ds.query(
        `SELECT user_register_id, phone_number, created_at FROM users_register
         ORDER BY created_at DESC NULLS LAST, phone_number LIMIT $1 OFFSET $2`,
        [limit, (page - 1) * limit],
      ),
      this.ds.query(`SELECT count(*)::int AS total FROM users_register`),
    ]);
    return { items, total: (count as { total: number }[])[0].total, page, limit };
  }

  /** HOST: Admin ACTIVE là con trực tiếp của HOST, cho dropdown chọn Admin cha khi đăng ký. */
  adminOptions(actor: AuthUser) {
    return this.ds.query(
      `SELECT u.user_id, u.phone_number, u.display_name
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.refer_user_id = $1 AND r.role_name = 'ADMIN' AND u.status = 'ACTIVE'
       ORDER BY u.display_name NULLS LAST, u.phone_number`,
      [actor.userId],
    );
  }

  /**
   * HOST cấp tài khoản USER cho một số đã đăng ký: một transaction xóa dòng users_register và INSERT users
   * (role USER, refer_user_id = Admin được chọn). Admin phải là con trực tiếp ACTIVE của HOST (ngoài phạm vi ⇒ 403).
   * Lỗi bất kỳ (kể cả phone đã có trong users ⇒ 409) ⇒ rollback, dòng đăng ký còn nguyên.
   */
  async activate(actor: AuthUser, registerId: string, dto: ActivateRegisterDto) {
    const admin = await this.permissions.assertCanGrantPoints(actor, dto.admin_id);   // con trực tiếp, role ADMIN, ACTIVE; ngược lại 403
    const roleRow = await this.ds.getRepository(RoleEntity).findOneBy({ roleName: "USER" });
    if (!roleRow) throw new Error("Role USER is not seeded");
    const password = await argon2.hash(dto.password, ARGON2_OPTIONS);

    try {
      return await this.ds.transaction(async (m) => {
        const deleted = await updateReturning<{ phone_number: string }>(m, `DELETE FROM users_register WHERE user_register_id = $1 RETURNING phone_number`, [registerId]);
        if (deleted.length === 0) throw new NotFoundException("Registration not found");
        const phone = deleted[0].phone_number;
        const rows: { user_id: string }[] = await m.query(
          `-- top-level: INSERT
           INSERT INTO users (phone_number, display_name, password, role_id, refer_user_id, status)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id`,
          [phone, dto.display_name ?? null, password, roleRow.roleId, admin.userId, UserStatus.ACTIVE],
        );
        this.log.log(`register activated actor=${actor.userId} user=${rows[0].user_id} admin=${admin.userId}`);
        return { user_id: rows[0].user_id, phone_number: phone, display_name: dto.display_name ?? null, role: "USER", status: UserStatus.ACTIVE, refer_user_id: admin.userId };
      });
    } catch (e) {
      if (e instanceof QueryFailedError && (e.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION) {
        throw new ConflictException("Phone number already exists");
      }
      throw e;
    }
  }
}
