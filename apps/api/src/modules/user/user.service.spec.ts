import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccountStatus, Role } from '@toolhackchain/shared';
import { UserService } from './user.service';

/**
 * RBAC scoping: an Admin(Con) must only ever reach its OWN Users. The repo mock
 * records the `where` clause so we can assert managedBySubAdminId is always part
 * of the lookup.
 */
describe('UserService (admin-con scoping)', () => {
  const conA = 'admincon-A';
  const conB = 'admincon-B';
  const pointsMock = () => ({ adjust: jest.fn().mockResolvedValue({}), transferSubAdminToUser: jest.fn().mockResolvedValue({}) });
  const auditMock = () => ({ record: jest.fn().mockResolvedValue(undefined) });
  const hostnamesMock = () => ({ find: jest.fn().mockResolvedValue([]) });

  function makeRepo(rows: any[]) {
    const calls: any[] = [];
    const repo: any = {
      calls,
      findOne: async ({ where }: any) => {
        calls.push(where);
        return (
          rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null
        );
      },
      find: async ({ where }: any) => {
        calls.push(where);
        return rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      },
      create: (x: any) => x,
      save: async (x: any) => ({ id: x.id ?? 'new-id', ...x }),
      remove: async (x: any) => x,
    };
    return repo;
  }

  it('findAll only returns Users of the acting Admin(Con)', async () => {
    const repo = makeRepo([
      { id: 'u1', managedBySubAdminId: conA, username: 'a1' },
      { id: 'u2', managedBySubAdminId: conB, username: 'b1' },
    ]);
    const svc = new UserService(repo, hostnamesMock() as any, pointsMock() as any, auditMock() as any);
    const list = await svc.findAll(conA);
    expect(list.map((x) => x.id)).toEqual(['u1']);
    expect(repo.calls[0]).toEqual({ managedBySubAdminId: conA });
  });

  it("findOne of another Admin(Con)'s User throws NotFound", async () => {
    const repo = makeRepo([{ id: 'u2', managedBySubAdminId: conB, username: 'b1' }]);
    const svc = new UserService(repo, hostnamesMock() as any, pointsMock() as any, auditMock() as any);
    await expect(svc.findOne(conA, 'u2')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.calls[0]).toEqual({ id: 'u2', managedBySubAdminId: conA });
  });

  it("delete/deactivate of another Admin(Con)'s User throws NotFound", async () => {
    const repo = makeRepo([{ id: 'u2', managedBySubAdminId: conB, username: 'b1' }]);
    const svc = new UserService(repo, hostnamesMock() as any, pointsMock() as any, auditMock() as any);
    await expect(svc.remove(conA, 'u2')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.deactivate(conA, 'u2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create assigns managedBySubAdminId and points 0', async () => {
    const repo = makeRepo([]);
    const svc = new UserService(repo, hostnamesMock() as any, pointsMock() as any, auditMock() as any);
    const created: any = await svc.create(conA, { username: 'newuser', password: 'secret123' });
    expect(created.managedBySubAdminId).toBe(conA);
    expect(created.points).toBe(0);
    expect(created.role).toBe(Role.USER);
    expect(created.status).toBe(AccountStatus.ACTIVE);
    expect(created.passwordHash).toBeUndefined();
  });

  it('create rejects duplicate username', async () => {
    const repo = makeRepo([{ id: 'u1', managedBySubAdminId: conA, username: 'dup' }]);
    const svc = new UserService(repo, hostnamesMock() as any, pointsMock() as any, auditMock() as any);
    await expect(
      svc.create(conA, { username: 'dup', password: 'secret123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
