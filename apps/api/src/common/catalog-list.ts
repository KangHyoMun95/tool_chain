// src/common/catalog-list.ts
// Dùng chung cho các API GET danh sách lobbies / categories / streams.
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { CatalogStatus, type Role } from "@toolhackchain/shared";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class CatalogListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) limit: number = DEFAULT_PAGE_SIZE;
  @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
  /** Tìm theo tên (chứa chuỗi, không phân biệt hoa thường). */
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

/** id bigint ở dạng chuỗi số (tối đa 18 chữ số để không tràn bigint). */
export const ID_PATTERN = /^\d{1,18}$/;
export const IdQuery = () => Matches(ID_PATTERN, { message: "phải là số nguyên dương" });

export type Page<T> = { items: T[]; total: number; page: number; limit: number };

/** USER chỉ thấy bản ghi ACTIVE; HOST / ADMIN lọc theo status tùy ý (không truyền thì lấy tất cả). */
export const effectiveStatus = (role: Role, requested?: CatalogStatus): CatalogStatus | undefined =>
  role === "USER" ? CatalogStatus.ACTIVE : requested;

/** Escape ký tự đặc biệt của LIKE để `q` luôn được hiểu là chuỗi thường. */
export const likePattern = (q: string): string => `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;
