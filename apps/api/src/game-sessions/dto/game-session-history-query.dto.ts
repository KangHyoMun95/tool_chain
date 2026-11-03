import { IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/catalog-list.js";

export class GameSessionHistoryQueryDto {
  /** Bỏ qua thì lấy shoe của ván mới nhất. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2_147_483_647) shoe?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) limit: number = DEFAULT_PAGE_SIZE;
}
