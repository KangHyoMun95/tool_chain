// src/auth/permission.service.ts
import { Inject, Injectable } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisKeys } from "@toolhackchain/shared";
import { REDIS } from "../redis/redis.module.js";

@Injectable()
export class PermissionService {
  constructor(@Inject(REDIS) private redis: Redis) {}
  async allowedItems(userId: string): Promise<Set<string>> {
    return new Set(await this.redis.smembers(RedisKeys.perm(userId)));
  }
}