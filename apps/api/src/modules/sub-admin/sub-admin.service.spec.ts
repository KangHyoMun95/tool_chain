import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccountStatus, Role } from '@toolhackchain/shared';
import { SubAdminService } from './sub-admin.service';

/**
 * These tests focus on RBAC scoping: a Host must only ever reach its OWN
 * Admin(Con)s. The repo mock records the `where` clause so we can assert
 * hostId is always part of the lookup.
 */
describe('SubAdminService (host scoping)', () => {
  const pointsMock = () => ({ adjust: jest.fn().mockResolvedValue({}) });

  const hostA = 'host-A';
  const hostB = 'host-B';

  function makeRepo(rows: any[]) {
    const calls: any[] = [];
    const repo: any = {
      calls,
      findOne: async ({ where }: any) => {
        calls.push(where);
        return (
          rows.find((r) =>
            Object.entries(where).every(([k, v]) => r[k] === v),
          ) ?? null
        );
      },
      find: async ({ where }: any) => {
        calls.push(where);
        return rows.filter((r) =>
          Object.entries(where).every(([k, v]) => r[k] === v),
        );
      },
      create: (x: any) => x,
      save: async (x: any) => ({ id: x.id ?? 'new-id', ...x }),
    };
    return repo;
  }

  it('findAll only returns Admin(Con)s of the acting Host', async () => {
    const repo = makeRepo([
      { id: 'c1', hostId: hostA, username: 'a1', status: AccountStatus.ACTIVE },
      { id: 'c2', hostId: hostB, username: 'b1', status: AccountStatus.ACTIVE },
    ]);
    const svc = new SubAdminService(repo, pointsMock() as any);
    const list = await svc.findAll(hostA);
    expect(list.map((x) => x.id)).toEqual(['c1']);
    expect(repo.calls[0]).toEqual({ hostId: hostA });
  });

  it('findOne of another Host\'s Admin(Con) throws NotFound (no cross-host access)', async () => {
    const repo = makeRepo([{ id: 'c2', hostId: hostB, username: 'b1' }]);
    const svc = new SubAdminService(repo, pointsMock() as any);
    await expect(svc.findOne(hostA, 'c2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // lookup MUST include hostId, never id alone
    expect(repo.calls[0]).toEqual({ id: 'c2', hostId: hostA });
  });

  it('update/deactivate of another Host\'s Admin(Con) throws NotFound', async () => {
    const repo = makeRepo([{ id: 'c2', hostId: hostB, username: 'b1' }]);
    const svc = new SubAdminService(repo, pointsMock() as any);
    await expect(svc.update(hostA, 'c2', { username: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.deactivate(hostA, 'c2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create assigns hostId and sets points to 0', async () => {
    const repo = makeRepo([]);
    const svc = new SubAdminService(repo, pointsMock() as any);
    const created: any = await svc.create(hostA, {
      username: 'newcon',
      password: 'secret123',
    });
    expect(created.hostId).toBe(hostA);
    expect(created.points).toBe(0);
    expect(created.role).toBe(Role.ADMIN_CON);
    expect((created as any).passwordHash).toBeUndefined();
  });

  it('create rejects duplicate username', async () => {
    const repo = makeRepo([{ id: 'c1', hostId: hostA, username: 'dup' }]);
    const svc = new SubAdminService(repo, pointsMock() as any);
    await expect(
      svc.create(hostA, { username: 'dup', password: 'secret123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
