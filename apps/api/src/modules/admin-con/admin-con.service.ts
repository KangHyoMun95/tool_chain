import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountStatus, Role } from '@toolhackchain/shared';
import { hashPassword } from '../../common/utils/password';
import { AdminCon } from '../../database/entities/admin-con.entity';
import { CreateAdminConDto } from './dto/create-admin-con.dto';
import { UpdateAdminConDto } from './dto/update-admin-con.dto';

/** Public shape of an Admin(Con) — never exposes passwordHash. */
export type AdminConView = Omit<AdminCon, 'passwordHash' | 'host' | 'users' | 'homepageConfig'>;

/**
 * CRUD for Admin(Con), performed by a Host.
 *
 * RBAC (see rbac-guard skill): every query is scoped to the acting Host via
 * `hostId = currentHostId`, so Host A can never see or modify Host B's
 * Admin(Con)s. Points are never mutated here — that goes through PointsService
 * with a PointTransaction audit record.
 */
@Injectable()
export class AdminConService {
  constructor(
    @InjectRepository(AdminCon)
    private readonly adminCons: Repository<AdminCon>,
  ) {}

  async create(
    hostId: string,
    dto: CreateAdminConDto,
  ): Promise<AdminConView> {
    const existing = await this.adminCons.findOne({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const entity = this.adminCons.create({
      username: dto.username,
      passwordHash: await hashPassword(dto.password),
      role: Role.ADMIN_CON,
      status: AccountStatus.ACTIVE,
      points: 0, // Point grants go through PointsService (audit trail).
      hostId,
    });
    const saved = await this.adminCons.save(entity);
    return this.toView(saved);
  }

  /** List only the Admin(Con)s owned by this Host. */
  async findAll(hostId: string): Promise<AdminConView[]> {
    const rows = await this.adminCons.find({
      where: { hostId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.toView(r));
  }

  async findOne(hostId: string, id: string): Promise<AdminConView> {
    return this.toView(await this.getOwned(hostId, id));
  }

  async update(
    hostId: string,
    id: string,
    dto: UpdateAdminConDto,
  ): Promise<AdminConView> {
    const entity = await this.getOwned(hostId, id);

    if (dto.username && dto.username !== entity.username) {
      const clash = await this.adminCons.findOne({
        where: { username: dto.username },
      });
      if (clash) throw new ConflictException('Username already taken');
      entity.username = dto.username;
    }
    if (dto.password) {
      entity.passwordHash = await hashPassword(dto.password);
    }

    return this.toView(await this.adminCons.save(entity));
  }

  /** Soft-delete: deactivate (Host does not hard-delete Admin(Con)s). */
  async deactivate(hostId: string, id: string): Promise<AdminConView> {
    return this.setStatus(hostId, id, AccountStatus.INACTIVE);
  }

  async activate(hostId: string, id: string): Promise<AdminConView> {
    return this.setStatus(hostId, id, AccountStatus.ACTIVE);
  }

  private async setStatus(
    hostId: string,
    id: string,
    status: AccountStatus,
  ): Promise<AdminConView> {
    const entity = await this.getOwned(hostId, id);
    entity.status = status;
    return this.toView(await this.adminCons.save(entity));
  }

  /**
   * Load an Admin(Con) ONLY if it belongs to this Host. Never look up by id
   * alone — that would let one Host reach another Host's Admin(Con).
   */
  private async getOwned(hostId: string, id: string): Promise<AdminCon> {
    const entity = await this.adminCons.findOne({ where: { id, hostId } });
    if (!entity) throw new NotFoundException('Admin(Con) not found');
    return entity;
  }

  private toView(entity: AdminCon): AdminConView {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, host, users, homepageConfig, ...view } = entity;
    return view;
  }
}
