import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtPayload, Role } from '@toolhackchain/shared';
import { SCOPE_RESOURCE_KEY } from '../constants';
import { ScopeResourceOptions } from '../decorators/scope-resource.decorator';
import { AdminCon } from '../../database/entities/admin-con.entity';
import { User } from '../../database/entities/user.entity';

/**
 * Global guard: enforces per-tier data ownership declared via @ScopeResource().
 *
 * Rules (see CLAUDE.md permission model):
 *  - HOST: full access, no scoping.
 *  - ADMIN_CON on a `user` resource: only Users where
 *    user.managedByAdminConId === caller.sub.
 *  - ADMIN_CON on an `adminCon` resource: only itself (caller.sub).
 *  - USER: only its own record.
 *
 * The resolved entity is attached to request.scopedResource for handler reuse.
 */
@Injectable()
export class ResourceScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AdminCon)
    private readonly adminCons: Repository<AdminCon>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<ScopeResourceOptions>(
      SCOPE_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    // Host bypasses all scoping.
    if (user.role === Role.HOST) return true;

    const idParam = options.idParam ?? 'id';
    const resourceId = request.params?.[idParam];
    if (!resourceId) {
      throw new ForbiddenException(`Missing route param "${idParam}"`);
    }

    if (options.type === 'adminCon') {
      return this.checkAdminConScope(user, resourceId, request);
    }
    return this.checkUserScope(user, resourceId, request);
  }

  private checkAdminConScope(
    user: JwtPayload,
    resourceId: string,
    request: Record<string, unknown>,
  ): boolean {
    // Only the Admin(Con) itself may act on its own adminCon resource.
    if (user.role === Role.ADMIN_CON && resourceId === user.sub) {
      request.scopedResource = { id: resourceId };
      return true;
    }
    throw new ForbiddenException('Out of scope');
  }

  private async checkUserScope(
    user: JwtPayload,
    resourceId: string,
    request: Record<string, unknown>,
  ): Promise<boolean> {
    const target = await this.users.findOne({ where: { id: resourceId } });
    if (!target) throw new NotFoundException('User not found');

    const allowed =
      (user.role === Role.ADMIN_CON &&
        target.managedByAdminConId === user.sub) ||
      (user.role === Role.USER && target.id === user.sub);

    if (!allowed) throw new ForbiddenException('Out of scope');
    request.scopedResource = target;
    return true;
  }
}
