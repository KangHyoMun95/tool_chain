// src/no-hu/no-hu.module.ts
import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module.js";
import { NoHuController } from "./no-hu.controller.js";
import { LuckyTimeController } from "./lucky-time.controller.js";
import { LuckyTimeService } from "./lucky-time.service.js";
import { NoHuService } from "./no-hu.service.js";

@Module({ imports: [BillingModule], controllers: [NoHuController, LuckyTimeController], providers: [NoHuService, LuckyTimeService] })
export class NoHuModule {}
