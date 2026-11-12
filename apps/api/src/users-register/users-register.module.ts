// src/users-register/users-register.module.ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { UsersRegisterController } from "./users-register.controller.js";
import { UsersRegisterService } from "./users-register.service.js";

@Module({ imports: [AuthModule], controllers: [UsersRegisterController], providers: [UsersRegisterService] })
export class UsersRegisterModule {}
