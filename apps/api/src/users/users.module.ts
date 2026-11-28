// src/users/users.module.ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
import { SubAdminsController } from "./sub-admins.controller.js";
import { SubAdminsService } from "./sub-admins.service.js";
import { UserPredictionHistoryController } from "./user-prediction-history.controller.js";
import { UserPredictionHistoryService } from "./user-prediction-history.service.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({ imports: [AuthModule], controllers: [UsersController, SubAdminsController, DashboardController, UserPredictionHistoryController], providers: [UsersService, SubAdminsService, DashboardService, UserPredictionHistoryService] })
export class UsersModule {}
