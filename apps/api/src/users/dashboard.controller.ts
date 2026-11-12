// src/users/dashboard.controller.ts
import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  @Roles("HOST", "ADMIN")
  get(@CurrentUser() actor: AuthUser) {
    return this.dashboard.get(actor);
  }
}
