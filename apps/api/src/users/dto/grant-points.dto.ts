// src/users/dto/grant-points.dto.ts
import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

export class GrantPointsDto {
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) amount!: number;
  /** Nguyên nhân cấp điểm (tùy chọn): trim, 1–200 ký tự, không ký tự điều khiển (khớp CHECK ở V15). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @Length(1, 200) @Matches(/^[^\p{Cc}]+$/u, { message: "reason must not contain control characters" })
  reason?: string;
}
