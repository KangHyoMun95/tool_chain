import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccountStatus, Role } from '@toolhackchain/shared';
import { hashPassword } from '../../common/utils/password';
import { User } from '../../database/entities/user.entity';
import { Hostname } from '../../database/entities/hostname.entity';
import { AuditAction, AuditService } from '../audit/audit.service';
import { PointsService } from '../points/points.service';
import { CreateUserDto } from './dto/create-user.dto';
import { GrantPointsDto } from './dto/grant-points.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export interface HostnameRef {
  id: string;
  name: string;
  url: string;
}

/** Public shape of a User — never exposes passwordHash; hostnames trimmed. */
export type UserView = Omit<
  User,
  'passwordHash' | 'managedBySubAdmin' | 'hostnames'
> & { hostnames: HostnameRef[] };

/**
 * CRUD for Users, performed by an Admin(Con).
 *
 * RBAC (see rbac-guard skill): every query is scoped to the acting Admin(Con)
 * via `managedBySubAdminId = adminConId`, so Admin(Con) A can never see or
 * modify Admin(Con) B's Users. Points go through the central PointsService.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Hostname)
    private readonly hostnames: Repository<Hostname>,
    private readonly pointsService: PointsService,
    private readonly audit: AuditService,
  ) {}

  private readonly ENTITY = 'User';
  private readonly ACTOR_ROLE = 'ADMIN_CON';

  async create(adminConId: string, dto: CreateUserDto): Promise<UserView> {
    const existing = await this.users.findOne({
      where: { username: dto.username },
    });
    if (existing) throw new ConflictException('Username already taken');

    const entity = this.users.create({
      username: dto.username,
      passwordHash: await hashPassword(dto.password),
      role: Role.USER,
      status: AccountStatus.ACTIVE,
      points: 0,
      managedBySubAdminId: adminConId,
      phoneNumber: dto.phoneNumber ?? null,
    });
    const saved = await this.users.save(entity);
    await this.audit.record({
      action: AuditAction.CREATE,
      entityType: this.ENTITY,
      entityId: saved.id,
      actorBy: adminConId,
      actorRole: this.ACTOR_ROLE,
      changes: [
        { columnName: 'username', newValue: saved.username },
        { columnName: 'phoneNumber', newValue: saved.phoneNumber },
      ],
    });
    return this.toView(saved);
  }

  async findAll(adminConId: string): Promise<UserView[]> {
    const rows = await this.users.find({
      where: { managedBySubAdminId: adminConId },
      order: { createdAt: 'DESC' },
      relations: { hostnames: true },
    });
    return rows.map((r) => this.toView(r));
  }

  /** Replace the set of hostnames assigned to a User (both owned by caller). */
  async setHostnames(
    adminConId: string,
    id: string,
    hostnameIds: string[],
  ): Promise<UserView> {
    const user = await this.getOwned(adminConId, id);
    const before = (user.hostnames ?? []).map((h) => h.id).sort();

    let selected: Hostname[] = [];
    if (hostnameIds.length) {
      selected = await this.hostnames.find({
        where: { id: In(hostnameIds), ownerSubAdminId: adminConId },
      });
      if (selected.length !== new Set(hostnameIds).size) {
        throw new NotFoundException('One or more hostnames not found');
      }
    }
    user.hostnames = selected;
    const saved = await this.users.save(user);
    await this.audit.record({
      action: AuditAction.UPDATE,
      entityType: this.ENTITY,
      entityId: id,
      actorBy: adminConId,
      actorRole: this.ACTOR_ROLE,
      changes: [
        {
          columnName: 'hostnames',
          oldValue: before,
          newValue: selected.map((h) => h.id).sort(),
        },
      ],
    });
    return this.toView(saved);
  }

  async findOne(adminConId: string, id: string): Promise<UserView> {
    return this.toView(await this.getOwned(adminConId, id));
  }

  async update(
    adminConId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserView> {
    const entity = await this.getOwned(adminConId, id);
    const changes: { columnName: string; oldValue?: unknown; newValue?: unknown }[] = [];

    if (dto.username && dto.username !== entity.username) {
      const clash = await this.users.findOne({
        where: { username: dto.username },
      });
      if (clash) throw new ConflictException('Username already taken');
      changes.push({ columnName: 'username', oldValue: entity.username, newValue: dto.username });
      entity.username = dto.username;
    }
    if (dto.password) {
      changes.push({ columnName: 'password', oldValue: '***', newValue: '***' });
      entity.passwordHash = await hashPassword(dto.password);
    }
    if (dto.phoneNumber !== undefined && dto.phoneNumber !== entity.phoneNumber) {
      changes.push({ columnName: 'phoneNumber', oldValue: entity.phoneNumber, newValue: dto.phoneNumber });
      entity.phoneNumber = dto.phoneNumber;
    }

    const saved = await this.users.save(entity);
    if (changes.length) {
      await this.audit.record({
        action: AuditAction.UPDATE,
        entityType: this.ENTITY,
        entityId: id,
        actorBy: adminConId,
        actorRole: this.ACTOR_ROLE,
        changes,
      });
    }
    return this.toView(saved);
  }

  /** Hard delete — an Admin(Con) may delete its own Users (see CLAUDE.md). */
  async remove(adminConId: string, id: string): Promise<{ id: string }> {
    const entity = await this.getOwned(adminConId, id);
    await this.users.remove(entity);
    await this.audit.record({
      action: AuditAction.DELETE,
      entityType: this.ENTITY,
      entityId: id,
      actorBy: adminConId,
      actorRole: this.ACTOR_ROLE,
      changes: [{ columnName: 'username', oldValue: entity.username }],
    });
    return { id };
  }

  async deactivate(adminConId: string, id: string): Promise<UserView> {
    return this.setStatus(adminConId, id, AccountStatus.INACTIVE);
  }

  async activate(adminConId: string, id: string): Promise<UserView> {
    return this.setStatus(adminConId, id, AccountStatus.ACTIVE);
  }

  async grantPoints(
    adminConId: string,
    id: string,
    dto: GrantPointsDto,
  ): Promise<UserView> {
    const before = await this.getOwned(adminConId, id); // 404 if not this Admin(Con)'s User
    // Granting to a User is funded from the Admin(Con)'s own balance (transfer),
    // not minted — the amount is deducted from the Admin(Con).
    await this.pointsService.transferSubAdminToUser({
      adminConId,
      userId: id,
      amount: dto.amount,
      direction: dto.direction,
      reason: dto.reason,
    });
    const view = await this.findOne(adminConId, id);
    await this.audit.record({
      action: AuditAction.GRANT_POINTS,
      entityType: this.ENTITY,
      entityId: id,
      actorBy: adminConId,
      actorRole: this.ACTOR_ROLE,
      changes: [{ columnName: 'points', oldValue: before.points, newValue: view.points }],
    });
    return view;
  }

  private async setStatus(
    adminConId: string,
    id: string,
    status: AccountStatus,
  ): Promise<UserView> {
    const entity = await this.getOwned(adminConId, id);
    const oldStatus = entity.status;
    entity.status = status;
    const saved = await this.users.save(entity);
    await this.audit.record({
      action:
        status === AccountStatus.ACTIVE
          ? AuditAction.ACTIVATE
          : AuditAction.DEACTIVATE,
      entityType: this.ENTITY,
      entityId: id,
      actorBy: adminConId,
      actorRole: this.ACTOR_ROLE,
      changes: [{ columnName: 'status', oldValue: oldStatus, newValue: status }],
    });
    return this.toView(saved);
  }

  /**
   * Load a User ONLY if it belongs to this Admin(Con). Never look up by id
   * alone — that would let one Admin(Con) reach another's Users.
   */
  private async getOwned(adminConId: string, id: string): Promise<User> {
    const entity = await this.users.findOne({
      where: { id, managedBySubAdminId: adminConId },
      relations: { hostnames: true },
    });
    if (!entity) throw new NotFoundException('User not found');
    return entity;
  }

  private toView(entity: User): UserView {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, managedBySubAdmin, hostnames, ...rest } = entity;
    return {
      ...rest,
      hostnames: (hostnames ?? []).map((h) => ({
        id: h.id,
        name: h.name,
        url: h.url,
      })),
    };
  }
}
