// src/users/dto/page-query.dto.ts
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/catalog-list.js";

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) limit: number = DEFAULT_PAGE_SIZE;
}
