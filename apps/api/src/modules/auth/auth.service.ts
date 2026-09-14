import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AccountStatus,
  AuthTokenResponse,
  JwtPayload,
  Role,
} from '@toolhackchain/shared';
import { verifyPassword } from '../../common/utils/password';
import { Admin } from '../../database/entities/admin.entity';
import { AdminCon } from '../../database/entities/admin-con.entity';
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
    @InjectRepository(AdminCon)
    private readonly adminCons: Repository<AdminCon>,
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

    const payload: JwtPayload = { sub: account.id, role: account.role };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, role: account.role };
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

    const adminCon = await this.adminCons.findOne({ where: { username } });
    if (adminCon) return this.toAccount(adminCon);

    const user = await this.users.findOne({ where: { username } });
    if (user) return this.toAccount(user);

    return null;
  }

  private toAccount(entity: Admin | AdminCon | User): AuthenticatedAccount {
    return {
      id: entity.id,
      role: entity.role,
      passwordHash: entity.passwordHash,
      status: entity.status,
    };
  }
}
