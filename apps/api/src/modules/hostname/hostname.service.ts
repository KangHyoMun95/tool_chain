import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Hostname } from '../../database/entities/hostname.entity';
import { AuditAction, AuditService } from '../audit/audit.service';
import { CreateHostnameDto } from './dto/create-hostname.dto';
import { UpdateHostnameDto } from './dto/update-hostname.dto';

export type HostnameView = Omit<Hostname, 'owner' | 'users'>;

/**
 * CRUD for homepages (hostnames), performed by an Admin(Con). Every query is
 * scoped to the owner (ownerSubAdminId = adminConId) so an Admin(Con) only ever
 * touches its own hostnames. Mutations are recorded via AuditService.
 */
@Injectable()
export class HostnameService {
  private readonly ENTITY = 'Hostname';
  private readonly ACTOR_ROLE = 'ADMIN_CON';

  constructor(
    @InjectRepository(Hostname)
    private readonly hostnames: Repository<Hostname>,
    private readonly audit: AuditService,
  ) {}

  async create(adminConId: string, dto: CreateHostnameDto): Promise<HostnameView> {
    const saved = await this.hostnames.save(
      this.hostnames.create({
        name: dto.name,
        url: dto.url,
        ownerSubAdminId: adminConId,
      }),
    );
    await this.audit.record({
      action: AuditAction.CREATE,
      entityType: this.ENTITY,
      entityId: saved.id,
      actorBy: adminConId,
      actorRole: this.ACTOR_ROLE,
      changes: [
        { columnName: 'name', newValue: saved.name },
        { columnName: 'url', newValue: saved.url },
      ],
    });
    return this.toView(saved);
  }

  async findAll(adminConId: string): Promise<HostnameView[]> {
    const rows = await this.hostnames.find({
      where: { ownerSubAdminId: adminConId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.toView(r));
  }

  async findOne(adminConId: string, id: string): Promise<HostnameView> {
    return this.toView(await this.getOwned(adminConId, id));
  }

  async update(
    adminConId: string,
    id: string,
    dto: UpdateHostnameDto,
  ): Promise<HostnameView> {
    const entity = await this.getOwned(adminConId, id);
    const changes: { columnName: string; oldValue?: unknown; newValue?: unknown }[] = [];
    if (dto.name !== undefined && dto.name !== entity.name) {
      changes.push({ columnName: 'name', oldValue: entity.name, newValue: dto.name });
      entity.name = dto.name;
    }
    if (dto.url !== undefined && dto.url !== entity.url) {
      changes.push({ columnName: 'url', oldValue: entity.url, newValue: dto.url });
      entity.url = dto.url;
    }
    const saved = await this.hostnames.save(entity);
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

  async remove(adminConId: string, id: string): Promise<{ id: string }> {
    const entity = await this.getOwned(adminConId, id);
    await this.hostnames.remove(entity);
    await this.audit.record({
      action: AuditAction.DELETE,
      entityType: this.ENTITY,
      entityId: id,
      actorBy: adminConId,
      actorRole: this.ACTOR_ROLE,
      changes: [{ columnName: 'name', oldValue: entity.name }],
    });
    return { id };
  }

  private async getOwned(adminConId: string, id: string): Promise<Hostname> {
    const entity = await this.hostnames.findOne({
      where: { id, ownerSubAdminId: adminConId },
    });
    if (!entity) throw new NotFoundException('Hostname not found');
    return entity;
  }

  private toView(entity: Hostname): HostnameView {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { owner, users, ...view } = entity;
    return view;
  }
}
