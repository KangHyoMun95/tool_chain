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
import { PointsService } from '../points/points.service';
import { CreateSubAdminDto } from './dto/create-sub-admin.dto';
import { GrantPointsDto } from './dto/grant-points.dto';
import { UpdateSubAdminDto } from './dto/update-sub-admin.dto';

/** Public shape of an Admin(Con) — never exposes passwordHash. */
export type SubAdminView = Omit<SubAdmin, 'passwordHash' | 'host' | 'users' | 'homepageConfig'>;

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
  ) {}

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
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return rows.map(({ passwordHash, managedBySubAdmin, ...view }) => view);
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
    });
    const saved = await this.subAdmins.save(entity);
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

    if (dto.username && dto.username !== entity.username) {
      const clash = await this.subAdmins.findOne({
        where: { username: dto.username },
      });
      if (clash) throw new ConflictException('Username already taken');
      entity.username = dto.username;
    }
    if (dto.password) {
      entity.passwordHash = await hashPassword(dto.password);
    }

    return this.toView(await this.subAdmins.save(entity));
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
    await this.getOwned(hostId, id); // 404 if not this Host's Admin(Con)
    await this.pointsService.adjust({
      fromAdminId: hostId,
      targetType: PointTargetType.ADMIN_CON,
      targetId: id,
      amount: dto.amount,
      direction: dto.direction,
      reason: dto.reason,
    });
    return this.findOne(hostId, id);
  }

  private async setStatus(
    hostId: string,
    id: string,
    status: AccountStatus,
  ): Promise<SubAdminView> {
    const entity = await this.getOwned(hostId, id);
    entity.status = status;
    return this.toView(await this.subAdmins.save(entity));
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
    const { passwordHash, host, users, homepageConfig, ...view } = entity;
    return view;
  }
}
