// src/auth/permission.service.ts
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Redis } from "ioredis";
import { DataSource } from "typeorm";
import { RedisKeys, UserStatus, type Role } from "@toolhackchain/shared";
import { RoleEntity, UserEntity } from "../database/entities/index.js";
import { REDIS } from "../redis/redis.module.js";
import type { AuthUser } from "./auth.types.js";

export type ManagedUser = { userId: string; role: Role; status: UserStatus };

// Cây quản lý: HOST → ADMIN → USER, nối bằng users.refer_user_id (cấp trên trực tiếp).
const MANAGES: Record<Role, Role | null> = { HOST: "ADMIN", ADMIN: "USER", USER: null };

@Injectable()
export class PermissionService {
  constructor(
    @Inject(REDIS) private redis: Redis,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async allowedItems(userId: string): Promise<Set<string>> {
    return new Set(await this.redis.smembers(RedisKeys.perm(userId)));
  }

  // Ném 403 nếu actor không quản lý trực tiếp target (kể cả khi target không tồn tại, để không lộ sự tồn tại).
  async assertCanManage(actor: AuthUser, targetUserId: string): Promise<ManagedUser> {
    const targetRole = MANAGES[actor.role];
    if (!targetRole || actor.userId === targetUserId) throw new ForbiddenException();

    const row = await this.dataSource
      .createQueryBuilder()
      .select("u.user_id", "user_id")
      .addSelect("r.role_name", "role")
      .addSelect("u.status", "status")
      .from(UserEntity, "u")
      .innerJoin(RoleEntity, "r", "r.role_id = u.role_id")
      .where("u.user_id = :targetUserId", { targetUserId })
      .andWhere("u.refer_user_id = :actorId", { actorId: actor.userId })
      .andWhere("r.role_name = :targetRole", { targetRole })
      .getRawOne<{ user_id: string; role: Role; status: UserStatus }>();

    if (!row) throw new ForbiddenException();
    return { userId: row.user_id, role: row.role, status: row.status };
  }

  // Cấp/trừ điểm: cùng phạm vi quản lý, không tự cấp cho chính mình (đã chặn trong assertCanManage).
  async assertCanGrantPoints(actor: AuthUser, targetUserId: string): Promise<ManagedUser> {
    const target = await this.assertCanManage(actor, targetUserId);
    if (target.status !== UserStatus.ACTIVE) throw new ForbiddenException();
    return target;
  }
}
