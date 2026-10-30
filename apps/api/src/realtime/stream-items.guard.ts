// src/realtime/stream-items.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PermissionService } from "../auth/permission.service.js";

@Injectable()
export class StreamItemsGuard implements CanActivate {
  constructor(private perms: PermissionService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const requested = String(req.query.items ?? "").split(",").filter(Boolean);
    const allowed = await this.perms.allowedItems(req.user.userId);
    const items = requested.filter((i) => allowed.has(i));
    if (items.length === 0) throw new ForbiddenException();
    req.allowedItems = items;
    return true;
  }
}