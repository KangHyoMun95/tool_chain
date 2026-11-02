// src/categories/categories.controller.ts
import { Controller, Get, Param, Query } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators.js";
import { IdParamDto } from "../common/catalog-list.js";
import { CategoriesService } from "./categories.service.js";
import { CategoryListQueryDto } from "./dto/category-list-query.dto.js";

// Chỉ đọc: tạo category nằm ở luồng ingestion. Mọi role đã đăng nhập đều xem được.
@Controller("categories")
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: CategoryListQueryDto) {
    return this.categories.list(actor.role, query);
  }

  @Get(":id")
  getOne(@CurrentUser() actor: AuthUser, @Param() params: IdParamDto) {
    return this.categories.getOne(actor.role, params.id);
  }
}
