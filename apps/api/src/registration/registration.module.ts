// src/registration/registration.module.ts
import { Module } from "@nestjs/common";
import { RegistrationController } from "./registration.controller.js";
import { RegistrationRequestGuard } from "./registration.guard.js";
import { RegistrationService } from "./registration.service.js";

@Module({ controllers: [RegistrationController], providers: [RegistrationService, RegistrationRequestGuard] })
export class RegistrationModule {}
