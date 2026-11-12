// src/users/dto/grant-points.dto.ts
import { IsInt, Max, Min } from "class-validator";

export class GrantPointsDto {
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) amount!: number;
}
