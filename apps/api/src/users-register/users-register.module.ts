// src/users-register/users-register.module.ts
import { Module } from "@nestjs/common";
import { UsersRegisterController } from "./users-register.controller.js";
import { UsersRegisterService } from "./users-register.service.js";

@Module({ controllers: [UsersRegisterController], providers: [UsersRegisterService] })
export class UsersRegisterModule {}
