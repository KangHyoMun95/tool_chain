// src/auth/dto/login.dto.ts
import { IsString, Length } from "class-validator";

export class LoginDto {
  @IsString() @Length(6, 20) phone_number!: string;
  @IsString() @Length(1, 128) password!: string;
}
