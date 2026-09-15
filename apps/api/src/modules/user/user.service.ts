import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountStatus, Role } from '@toolhackchain/shared';
import { hashPassword } from '../../common/utils/password';
import { User } from '../../database/entities/user.entity';
import { PointsService } from '../points/points.service';
import { CreateUserDto } from './dto/create-user.dto';
import { GrantPointsDto } from './dto/grant-points.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** Public shape of a User — never exposes passwordHash. */
export type UserView = Omit<User, 'passwordHash' | 'managedBySubAdmin'>;

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
    private readonly pointsService: PointsService,
  ) {}

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
    return this.toView(await this.users.save(entity));
  }

  async findAll(adminConId: string): Promise<UserView[]> {
    const rows = await this.users.find({
      where: { managedBySubAdminId: adminConId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.toView(r));
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

    if (dto.username && dto.username !== entity.username) {
      const clash = await this.users.findOne({
        where: { username: dto.username },
      });
      if (clash) throw new ConflictException('Username already taken');
      entity.username = dto.username;
    }
    if (dto.password) entity.passwordHash = await hashPassword(dto.password);
    if (dto.phoneNumber !== undefined) entity.phoneNumber = dto.phoneNumber;

    return this.toView(await this.users.save(entity));
  }

  /** Hard delete — an Admin(Con) may delete its own Users (see CLAUDE.md). */
  async remove(adminConId: string, id: string): Promise<{ id: string }> {
    const entity = await this.getOwned(adminConId, id);
    await this.users.remove(entity);
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
    await this.getOwned(adminConId, id); // 404 if not this Admin(Con)'s User
    // Granting to a User is funded from the Admin(Con)'s own balance (transfer),
    // not minted — the amount is deducted from the Admin(Con).
    await this.pointsService.transferSubAdminToUser({
      adminConId,
      userId: id,
      amount: dto.amount,
      direction: dto.direction,
      reason: dto.reason,
    });
    return this.findOne(adminConId, id);
  }

  private async setStatus(
    adminConId: string,
    id: string,
    status: AccountStatus,
  ): Promise<UserView> {
    const entity = await this.getOwned(adminConId, id);
    entity.status = status;
    return this.toView(await this.users.save(entity));
  }

  /**
   * Load a User ONLY if it belongs to this Admin(Con). Never look up by id
   * alone — that would let one Admin(Con) reach another's Users.
   */
  private async getOwned(adminConId: string, id: string): Promise<User> {
    const entity = await this.users.findOne({
      where: { id, managedBySubAdminId: adminConId },
    });
    if (!entity) throw new NotFoundException('User not found');
    return entity;
  }

  private toView(entity: User): UserView {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, managedBySubAdmin, ...view } = entity;
    return view;
  }
}
