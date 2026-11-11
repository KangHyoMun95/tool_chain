// src/users/dto/sub-admin-list-query.dto.ts
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { UserStatus } from "@toolhackchain/shared";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/catalog-list.js";

export class SubAdminListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) limit: number = DEFAULT_PAGE_SIZE;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsIn(["ADMIN", "USER"]) role?: "ADMIN" | "USER";
  /** Số điện thoại chứa chuỗi này (chỉ chữ số). */
  @IsOptional() @IsString() @MaxLength(20) @Matches(/^\d+$/) q?: string;
}
