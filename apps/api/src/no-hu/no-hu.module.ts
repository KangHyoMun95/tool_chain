// src/no-hu/no-hu.module.ts
import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module.js";
import { NoHuController } from "./no-hu.controller.js";
import { NoHuService } from "./no-hu.service.js";

@Module({ imports: [BillingModule], controllers: [NoHuController], providers: [NoHuService] })
export class NoHuModule {}
