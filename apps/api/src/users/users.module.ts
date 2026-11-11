// src/users/users.module.ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { SubAdminsController } from "./sub-admins.controller.js";
import { SubAdminsService } from "./sub-admins.service.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({ imports: [AuthModule], controllers: [UsersController, SubAdminsController], providers: [UsersService, SubAdminsService] })
export class UsersModule {}
