import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountStatus, PointTargetType, Role } from '@toolhackchain/shared';
import { hashPassword } from '../../common/utils/password';
import { SubAdmin } from '../../database/entities/sub-admin.entity';
import { User } from '../../database/entities/user.entity';
import { AuditAction, AuditService } from '../audit/audit.service';
import { PointsService } from '../points/points.service';
import { CreateSubAdminDto } from './dto/create-sub-admin.dto';
import { GrantPointsDto } from './dto/grant-points.dto';
import { UpdateSubAdminDto } from './dto/update-sub-admin.dto';

/** Public shape of an Admin(Con) — never exposes passwordHash. */
export type SubAdminView = Omit<SubAdmin, 'passwordHash' | 'host' | 'users'>;

/**
 * CRUD for Admin(Con), performed by a Host.
 *
 * RBAC (see rbac-guard skill): every query is scoped to the acting Host via
 * `hostId = currentHostId`, so Host A can never see or modify Host B's
 * Admin(Con)s. Points are never mutated here — that goes through PointsService
 * with a PointTransaction audit record.
 */
@Injectable()
export class SubAdminService {
  constructor(
    @InjectRepository(SubAdmin)
    private readonly subAdmins: Repository<SubAdmin>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly pointsService: PointsService,
    private readonly audit: AuditService,
  ) {}

  private readonly ENTITY = 'SubAdmin';
  private readonly ACTOR_ROLE = 'HOST';

  /**
   * Host reads the Users managed by one of its own Admin(Con)s. Ownership of
   * the Admin(Con) is verified first (host scope), so a Host cannot read Users
   * under another Host's Admin(Con).
   */
  async listUsers(hostId: string, subAdminId: string) {
    await this.getOwned(hostId, subAdminId); // 404 if not this Host's Admin(Con)
    const rows = await this.users.find({
      where: { managedBySubAdminId: subAdminId },
      order: { createdAt: 'DESC' },
      relations: { hostnames: true },
    });
    return rows.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ passwordHash, managedBySubAdmin, hostnames, ...view }) => ({
        ...view,
        hostnames: (hostnames ?? []).map((h) => ({
          id: h.id,
          name: h.name,
          url: h.url,
        })),
      }),
    );
  }

  async create(
    hostId: string,
    dto: CreateSubAdminDto,
  ): Promise<SubAdminView> {
    const existing = await this.subAdmins.findOne({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const entity = this.subAdmins.create({
      username: dto.username,
      passwordHash: await hashPassword(dto.password),
      role: Role.ADMIN_CON,
      status: AccountStatus.ACTIVE,
      points: 0, // Point grants go through PointsService (audit trail).
      hostId,
      phoneNumber: dto.phoneNumber ?? null,
    });
    const saved = await this.subAdmins.save(entity);
    await this.audit.record({
      action: AuditAction.CREATE,
      entityType: this.ENTITY,
      entityId: saved.id,
      actorBy: hostId,
      actorRole: this.ACTOR_ROLE,
      changes: [
        { columnName: 'username', newValue: saved.username },
        { columnName: 'phoneNumber', newValue: saved.phoneNumber },
      ],
    });
    return this.toView(saved);
  }

  /** List only the Admin(Con)s owned by this Host. */
  async findAll(hostId: string): Promise<SubAdminView[]> {
    const rows = await this.subAdmins.find({
      where: { hostId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.toView(r));
  }

  async findOne(hostId: string, id: string): Promise<SubAdminView> {
    return this.toView(await this.getOwned(hostId, id));
  }

  async update(
    hostId: string,
    id: string,
    dto: UpdateSubAdminDto,
  ): Promise<SubAdminView> {
    const entity = await this.getOwned(hostId, id);
    const changes: { columnName: string; oldValue?: unknown; newValue?: unknown }[] = [];

    if (dto.username && dto.username !== entity.username) {
      const clash = await this.subAdmins.findOne({
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

    const saved = await this.subAdmins.save(entity);
    if (changes.length) {
      await this.audit.record({
        action: AuditAction.UPDATE,
        entityType: this.ENTITY,
        entityId: id,
        actorBy: hostId,
        actorRole: this.ACTOR_ROLE,
        changes,
      });
    }
    return this.toView(saved);
  }

  /** Soft-delete: deactivate (Host does not hard-delete Admin(Con)s). */
  async deactivate(hostId: string, id: string): Promise<SubAdminView> {
    return this.setStatus(hostId, id, AccountStatus.INACTIVE);
  }

  async activate(hostId: string, id: string): Promise<SubAdminView> {
    return this.setStatus(hostId, id, AccountStatus.ACTIVE);
  }

  /**
   * Grant/deduct points for an owned Admin(Con). Ownership is verified first
   * (host scope), then the balance change + audit record go through the central
   * PointsService in one transaction — never mutate `points` directly here.
   */
  async grantPoints(
    hostId: string,
    id: string,
    dto: GrantPointsDto,
  ): Promise<SubAdminView> {
    const before = await this.getOwned(hostId, id); // 404 if not this Host's Admin(Con)
    await this.pointsService.adjust({
      fromAdminId: hostId,
      targetType: PointTargetType.ADMIN_CON,
      targetId: id,
      amount: dto.amount,
      direction: dto.direction,
      reason: dto.reason,
    });
    const view = await this.findOne(hostId, id);
    await this.audit.record({
      action: AuditAction.GRANT_POINTS,
      entityType: this.ENTITY,
      entityId: id,
      actorBy: hostId,
      actorRole: this.ACTOR_ROLE,
      changes: [{ columnName: 'points', oldValue: before.points, newValue: view.points }],
    });
    return view;
  }

  private async setStatus(
    hostId: string,
    id: string,
    status: AccountStatus,
  ): Promise<SubAdminView> {
    const entity = await this.getOwned(hostId, id);
    const oldStatus = entity.status;
    entity.status = status;
    const saved = await this.subAdmins.save(entity);
    await this.audit.record({
      action:
        status === AccountStatus.ACTIVE
          ? AuditAction.ACTIVATE
          : AuditAction.DEACTIVATE,
      entityType: this.ENTITY,
      entityId: id,
      actorBy: hostId,
      actorRole: this.ACTOR_ROLE,
      changes: [{ columnName: 'status', oldValue: oldStatus, newValue: status }],
    });
    return this.toView(saved);
  }

  /**
   * Load an Admin(Con) ONLY if it belongs to this Host. Never look up by id
   * alone — that would let one Host reach another Host's Admin(Con).
   */
  private async getOwned(hostId: string, id: string): Promise<SubAdmin> {
    const entity = await this.subAdmins.findOne({ where: { id, hostId } });
    if (!entity) throw new NotFoundException('Admin(Con) not found');
    return entity;
  }

  private toView(entity: SubAdmin): SubAdminView {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, host, users, ...view } = entity;
    return view;
  }
}
