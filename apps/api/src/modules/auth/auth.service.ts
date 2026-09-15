import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AccountStatus,
  AuthTokenResponse,
  JwtPayload,
  ProfileResponse,
  Role,
} from '@toolhackchain/shared';
import { verifyPassword } from '../../common/utils/password';
import { Admin } from '../../database/entities/admin.entity';
import { SubAdmin } from '../../database/entities/sub-admin.entity';
import { User } from '../../database/entities/user.entity';
import { LoginDto } from './dto/login.dto';

interface AuthenticatedAccount {
  id: string;
  role: Role;
  passwordHash: string;
  status: AccountStatus;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    @InjectRepository(SubAdmin)
    private readonly subAdmins: Repository<SubAdmin>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async login(dto: LoginDto): Promise<AuthTokenResponse> {
    const account = await this.findByUsername(dto.username);
    const ok =
      account && (await verifyPassword(dto.password, account.passwordHash));
    if (!account || !ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (account.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.touchLastLogin(account.role, account.id);

    const payload: JwtPayload = { sub: account.id, role: account.role };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, role: account.role };
  }

  /** Record the login time on the matched account (for the 7-day metric). */
  private async touchLastLogin(role: Role, id: string): Promise<void> {
    const now = new Date();
    if (role === Role.HOST) await this.admins.update(id, { lastLoginAt: now });
    else if (role === Role.ADMIN_CON)
      await this.subAdmins.update(id, { lastLoginAt: now });
    else await this.users.update(id, { lastLoginAt: now });
  }

  /** Current account profile (id, role, username, points) for GET /auth/me. */
  async getProfile(payload: JwtPayload): Promise<ProfileResponse> {
    const account =
      payload.role === Role.HOST
        ? await this.admins.findOne({ where: { id: payload.sub } })
        : payload.role === Role.ADMIN_CON
          ? await this.subAdmins.findOne({ where: { id: payload.sub } })
          : await this.users.findOne({ where: { id: payload.sub } });
    if (!account) throw new UnauthorizedException('Account not found');
    return {
      sub: account.id,
      role: account.role,
      username: account.username,
      points: account.points,
    };
  }

  /**
   * Usernames are unique per table; look up across all three account tiers.
   * Returns the first match, or null.
   */
  private async findByUsername(
    username: string,
  ): Promise<AuthenticatedAccount | null> {
    const admin = await this.admins.findOne({ where: { username } });
    if (admin) return this.toAccount(admin);

    const subAdmin = await this.subAdmins.findOne({ where: { username } });
    if (subAdmin) return this.toAccount(subAdmin);

    const user = await this.users.findOne({ where: { username } });
    if (user) return this.toAccount(user);

    return null;
  }

  private toAccount(entity: Admin | SubAdmin | User): AuthenticatedAccount {
    return {
      id: entity.id,
      role: entity.role,
      passwordHash: entity.passwordHash,
      status: entity.status,
    };
  }
}
