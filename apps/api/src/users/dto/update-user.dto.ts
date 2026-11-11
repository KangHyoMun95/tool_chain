// src/users/dto/update-user.dto.ts
import { IsOptional, IsString, Length, Matches } from "class-validator";

// Ít nhất một trường (kiểm tra ở service). Không nhận role / refer_user_id / status.
export class UpdateUserDto {
  @IsOptional() @IsString() @Length(6, 20) @Matches(/^\d+$/) phone_number?: string;
  @IsOptional() @IsString() @Length(12, 128) password?: string;
}
