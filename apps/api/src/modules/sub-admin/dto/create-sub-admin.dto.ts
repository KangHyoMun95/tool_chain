import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

/** Payload for a Host creating a new Admin(Con). */
export class CreateSubAdminDto {
  @IsString()
  @Length(3, 64)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;
}
