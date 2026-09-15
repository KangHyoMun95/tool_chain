import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PointDirection } from '@toolhackchain/shared';

/** Payload for an Admin(Con) granting/deducting points to one of its Users. */
export class GrantPointsDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  amount: number;

  @IsEnum(PointDirection)
  direction: PointDirection;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
