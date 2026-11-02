// src/lobbies/lobbies.controller.ts
import { Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators.js";
import { CatalogListQueryDto } from "../common/catalog-list.js";
import { LobbiesService } from "./lobbies.service.js";

// Chỉ đọc: tạo lobby nằm ở luồng ingestion (event từ crawler). Mọi role đã đăng nhập đều xem được.
@Controller("lobbies")
export class LobbiesController {
  constructor(private lobbies: LobbiesService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: CatalogListQueryDto) {
    return this.lobbies.list(actor.role, query);
  }
}
