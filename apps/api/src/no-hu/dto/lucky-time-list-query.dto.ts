// src/no-hu/dto/lucky-time-list-query.dto.ts
import { IsOptional, IsUUID } from "class-validator";

export class LuckyTimeListQueryDto {
  /** Bỏ trống = mọi category của lobby NỔ HŨ (không phải lịch dùng chung: lịch dùng chung không còn). */
  @IsOptional() @IsUUID() category_id?: string;
}
