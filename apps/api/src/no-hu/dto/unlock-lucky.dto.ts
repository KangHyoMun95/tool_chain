// src/no-hu/dto/unlock-lucky.dto.ts
import { IsUUID } from "class-validator";

export class UnlockLuckyDto {
  @IsUUID() lucky_time_id!: string;
}
