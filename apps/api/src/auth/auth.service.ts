// src/auth/auth.service.ts
import { Injectable, Logger, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectDataSource } from "@nestjs/typeorm";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { UserStatus, type Role } from "@toolhackchain/shared";
import type { EnvVars } from "../config/env.validation.js";
import { RoleEntity, UserEntity } from "../database/entities/index.js";
import { LoginAttemptsService } from "./login-attempts.service.js";
import { ARGON2_OPTIONS } from "./password.js";
import { SessionService } from "./session.service.js";

const INVALID_CREDENTIALS = "Invalid phone number or password";

type LoginRow = { user_id: string; password: string; status: UserStatus; role: Role };

export type TokenPair = { accessToken: string; expiresIn: number; refreshToken: string };

export type MeResponse = {
  user_id: string;
  phone_number: string;
  role: Role;
  status: UserStatus;
  balance: string; // bigint → string
  refer_user_id: string | null;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly log = new Logger(AuthService.name);
  private dummyHash = "";

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private jwt: JwtService,
    private sessions: SessionService,
    private attempts: LoginAttemptsService,
    private config: ConfigService<EnvVars, true>,
  ) {}

  async onModuleInit() {
    // Hash giả để user không tồn tại cũng tốn thời gian verify như user thật.
    this.dummyHash = await argon2.hash(randomBytes(16).toString("hex"), ARGON2_OPTIONS);
  }

  private mask(phone: string): string {
    return phone.length <= 3 ? "***" : `${"*".repeat(phone.length - 3)}${phone.slice(-3)}`;
  }

  private signAccessToken(userId: string, role: Role, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { role, sid: sessionId },
      { subject: userId, jwtid: randomUUID(), expiresIn: this.config.get("ACCESS_TOKEN_TTL_SECONDS", { infer: true }) },
    );
  }

  private async issue(userId: string, role: Role, sessionId: string, refreshToken: string): Promise<TokenPair> {
    return {
      accessToken: await this.signAccessToken(userId, role, sessionId),
      expiresIn: this.config.get("ACCESS_TOKEN_TTL_SECONDS", { infer: true }),
      refreshToken,
    };
  }

  async login(phone: string, password: string, ip: string): Promise<TokenPair> {
    await this.attempts.assertNotLocked(phone);

    const row = await this.dataSource
      .createQueryBuilder()
      .select("u.user_id", "user_id")
      .addSelect("u.password", "password")
      .addSelect("u.status", "status")
      .addSelect("r.role_name", "role")
      .from(UserEntity, "u")
      .innerJoin(RoleEntity, "r", "r.role_id = u.role_id")
      .where("u.phone_number = :phone", { phone })
      .getRawOne<LoginRow>();

    const passwordOk = await argon2.verify(row?.password ?? this.dummyHash, password).catch(() => false);
    if (!row || !passwordOk || row.status !== UserStatus.ACTIVE) {
      await this.attempts.recordFailure(phone);
      this.log.warn(`login failed phone=${this.mask(phone)} ip=${ip}`);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.attempts.clear(phone);
    const { sessionId, refreshToken } = await this.sessions.create(row.user_id, row.role);
    this.log.log(`login ok user_id=${row.user_id} ip=${ip}`);
    return this.issue(row.user_id, row.role, sessionId, refreshToken);
  }

  async refresh(presentedToken: string | undefined, ip: string): Promise<TokenPair> {
    if (!presentedToken) throw new UnauthorizedException();

    const result = await this.sessions.rotate(presentedToken);
    if (result.status === "reused") {
      // Token cũ bị dùng lại → coi như bị đánh cắp, thu hồi cả session.
      await this.sessions.revoke(result.sessionId!);
      this.log.warn(`refresh token reuse detected sid=${result.sessionId} ip=${ip}`);
      throw new UnauthorizedException();
    }
    if (result.status !== "ok") throw new UnauthorizedException();

    const user = await this.findAuthUser(result.session.user_id);
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.sessions.revokeAllSessions(result.session.user_id);
      throw new UnauthorizedException();
    }

    await this.sessions.updateRole(result.sessionId, result.session, user.role);
    return this.issue(user.user_id, user.role, result.sessionId, result.refreshToken);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.findAuthUser(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private findAuthUser(userId: string): Promise<MeResponse | undefined> {
    return this.dataSource
      .createQueryBuilder()
      .select("u.user_id", "user_id")
      .addSelect("u.phone_number", "phone_number")
      .addSelect("r.role_name", "role")
      .addSelect("u.status", "status")
      .addSelect("u.balance", "balance")
      .addSelect("u.refer_user_id", "refer_user_id")
      .from(UserEntity, "u")
      .innerJoin(RoleEntity, "r", "r.role_id = u.role_id")
      .where("u.user_id = :userId", { userId })
      .getRawOne<MeResponse>();
  }
}
