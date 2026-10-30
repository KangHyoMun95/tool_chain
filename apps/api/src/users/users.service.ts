// src/users/users.service.ts
import { ConflictException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { UserStatus } from "@toolhackchain/shared";
import type { AuthUser } from "../auth/auth.types.js";
import { PermissionService } from "../auth/permission.service.js";
import { SessionService } from "../auth/session.service.js";
import { UserEntity } from "../database/entities/index.js";

@Injectable()
export class UsersService {
  private readonly log = new Logger(UsersService.name);

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private permissions: PermissionService,
    private sessions: SessionService,
  ) {}

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
