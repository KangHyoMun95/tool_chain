import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@toolhackchain/shared';
import { ResourceScopeGuard } from './resource-scope.guard';

type Req = { user?: any; params?: Record<string, string>; scopedResource?: any };

function ctxFor(req: Req): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardWith(
  scopeOptions: any,
  targetUser: any,
): ResourceScopeGuard {
  const reflector = {
    getAllAndOverride: () => scopeOptions,
  } as unknown as Reflector;
  const users = { findOne: async () => targetUser } as any;
  const subAdmins = { findOne: async () => null } as any;
  return new ResourceScopeGuard(reflector, users, subAdmins);
}

describe('ResourceScopeGuard', () => {
  const conA = 'admincon-A';
  const conB = 'admincon-B';

  it('passes routes without @ScopeResource metadata', async () => {
    const guard = guardWith(undefined, null);
    await expect(
      guard.canActivate(ctxFor({ user: { sub: conA, role: Role.ADMIN_CON } })),
    ).resolves.toBe(true);
  });

  it('lets HOST through without a DB lookup', async () => {
    const guard = guardWith({ type: 'user', idParam: 'id' }, null);
    await expect(
      guard.canActivate(
        ctxFor({ user: { sub: 'host', role: Role.HOST }, params: { id: 'u1' } }),
      ),
    ).resolves.toBe(true);
  });

  it('allows ADMIN_CON to act on its OWN user', async () => {
    const target = { id: 'u1', managedBySubAdminId: conA };
    const guard = guardWith({ type: 'user', idParam: 'id' }, target);
    const req: Req = { user: { sub: conA, role: Role.ADMIN_CON }, params: { id: 'u1' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.scopedResource).toBe(target);
  });

  it('BLOCKS ADMIN_CON A from touching a user owned by ADMIN_CON B', async () => {
    const target = { id: 'u2', managedBySubAdminId: conB };
    const guard = guardWith({ type: 'user', idParam: 'id' }, target);
    await expect(
      guard.canActivate(
        ctxFor({ user: { sub: conA, role: Role.ADMIN_CON }, params: { id: 'u2' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows USER on its own record but blocks others', async () => {
    const guardSelf = guardWith(
      { type: 'user', idParam: 'id' },
      { id: 'u1', managedBySubAdminId: conA },
    );
    await expect(
      guardSelf.canActivate(
        ctxFor({ user: { sub: 'u1', role: Role.USER }, params: { id: 'u1' } }),
      ),
    ).resolves.toBe(true);

    const guardOther = guardWith(
      { type: 'user', idParam: 'id' },
      { id: 'u9', managedBySubAdminId: conA },
    );
    await expect(
      guardOther.canActivate(
        ctxFor({ user: { sub: 'u1', role: Role.USER }, params: { id: 'u9' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks ADMIN_CON from another ADMIN_CON resource', async () => {
    const guard = guardWith({ type: 'subAdmin', idParam: 'id' }, null);
    await expect(
      guard.canActivate(
        ctxFor({ user: { sub: conA, role: Role.ADMIN_CON }, params: { id: conB } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
