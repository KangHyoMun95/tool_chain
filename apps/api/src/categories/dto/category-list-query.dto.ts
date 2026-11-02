// src/categories/dto/category-list-query.dto.ts
import { IsOptional } from "class-validator";
import { CatalogListQueryDto, IdQuery } from "../../common/catalog-list.js";

export class CategoryListQueryDto extends CatalogListQueryDto {
  @IsOptional() @IdQuery() lobby_id?: string;
}
