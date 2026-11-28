// src/users/dto/prediction-history-query.dto.ts
import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { PageQueryDto } from "./page-query.dto.js";

export class PredictionHistoryQueryDto extends PageQueryDto {
  @IsOptional() @IsDateString() from?: string;   // game_sessions.created_at >= from
  @IsOptional() @IsDateString() to?: string;     // game_sessions.created_at <= to
  @IsOptional() @IsUUID() lobby_id?: string;
  @IsOptional() @IsUUID() category_id?: string;
  @IsOptional() @IsUUID() stream_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2_147_483_647) game_shoe?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2_147_483_647) game_round?: number;
}
