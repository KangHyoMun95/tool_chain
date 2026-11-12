// src/users/dto/sub-admin-list-query.dto.ts
import { Transform, Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { UserStatus } from "@toolhackchain/shared";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/catalog-list.js";

export class SubAdminListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) limit: number = DEFAULT_PAGE_SIZE;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsIn(["ADMIN", "USER"]) role?: "ADMIN" | "USER";
  /** Số điện thoại hoặc tên hiển thị chứa chuỗi này (không phân biệt hoa thường). */
  @IsOptional() @Transform(({ value }) => (typeof value === "string" ? value.trim() : value)) @IsString() @MinLength(1) @MaxLength(50) q?: string;
}
