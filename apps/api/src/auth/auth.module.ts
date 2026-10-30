// src/auth/auth.module.ts
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import type { EnvVars } from "../config/env.validation.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { LoginAttemptsService } from "./login-attempts.service.js";
import { PermissionService } from "./permission.service.js";
import { RolesGuard } from "./roles.guard.js";
import { SessionGuard } from "./session.guard.js";
import { SessionService } from "./session.service.js";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => ({
        secret: config.get("JWT_SECRET", { infer: true }),
        signOptions: { algorithm: "HS256" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionService, LoginAttemptsService, PermissionService, SessionGuard, RolesGuard],
  exports: [JwtModule, SessionService, PermissionService, SessionGuard, RolesGuard],
})
export class AuthModule {}
