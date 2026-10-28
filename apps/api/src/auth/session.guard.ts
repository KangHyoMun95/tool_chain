// src/auth/session.guard.ts
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisKeys } from "@toolhackchain/shared";
import { REDIS } from "../redis/redis.module.js";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(REDIS) private redis: Redis) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const sid = req.cookies?.session;
    const userId = sid && (await this.redis.get(RedisKeys.session(sid)));
    if (!userId) throw new UnauthorizedException();
    req.user = { id: userId };
    return true;
  }
}