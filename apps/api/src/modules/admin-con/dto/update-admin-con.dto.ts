import { IsOptional, IsString, Length, MinLength } from 'class-validator';

/** Partial update of an Admin(Con). Points are NOT changed here (use PointsService). */
export class UpdateAdminConDto {
  @IsOptional()
  @IsString()
  @Length(3, 64)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
