// src/category-config/category-config.module.ts
import { Global, Module } from "@nestjs/common";
import { CategoryConfigService } from "./category-config.service.js";

@Global()
@Module({ providers: [CategoryConfigService], exports: [CategoryConfigService] })
export class CategoryConfigModule {}
