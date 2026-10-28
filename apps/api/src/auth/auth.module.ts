// src/auth/auth.module.ts
import { Module } from "@nestjs/common";
import { SessionGuard } from "./session.guard.js";
import { PermissionService } from "./permission.service.js";

@Module({ providers: [PermissionService, SessionGuard], exports: [PermissionService, SessionGuard] })
export class AuthModule {}