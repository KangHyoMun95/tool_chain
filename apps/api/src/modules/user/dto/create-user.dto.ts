import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

/** Payload for an Admin(Con) creating a User under its own management. */
export class CreateUserDto {
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
