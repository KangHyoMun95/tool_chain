import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

/** Partial update of an Admin(Con). Points are NOT changed here (use PointsService). */
export class UpdateSubAdminDto {
  @IsOptional()
  @IsString()
  @Length(3, 64)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;
}
