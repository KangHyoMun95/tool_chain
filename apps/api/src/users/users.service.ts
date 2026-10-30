// src/users/users.service.ts
import { ConflictException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import argon2 from "argon2";
import { DataSource, QueryFailedError } from "typeorm";
import { UserStatus } from "@toolhackchain/shared";
import type { AuthUser } from "../auth/auth.types.js";
import { ARGON2_OPTIONS } from "../auth/password.js";
import { PermissionService } from "../auth/permission.service.js";
import { SessionService } from "../auth/session.service.js";
import { RoleEntity, UserEntity } from "../database/entities/index.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";

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
          password,
          roleId: roleRow.roleId,
          referUserId: actor.userId,
          status: UserStatus.ACTIVE,
        })
        .execute();

      const userId = String(result.identifiers[0].userId);
      this.log.log(`user created actor=${actor.userId} target=${userId} role=${role}`);
      return { user_id: userId, phone_number: dto.phone_number, role, status: UserStatus.ACTIVE, refer_user_id: actor.userId };
    } catch (e) {
      if (e instanceof QueryFailedError && (e.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION) {
        throw new ConflictException("Phone number already exists");
      }
      throw e;
    }
  }

  async updateStatus(actor: AuthUser, targetUserId: string, status: UserStatus) {
    const target = await this.permissions.assertCanManage(actor, targetUserId);
    // Xóa (soft delete) User là quyền của Admin; Host chỉ được kích hoạt / hủy kích hoạt Admin.
    if (status === UserStatus.DELETED && actor.role !== "ADMIN") throw new ForbiddenException();
    if (target.status === UserStatus.DELETED) throw new ConflictException("User is deleted");

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
}
