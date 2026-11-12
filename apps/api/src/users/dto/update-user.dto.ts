// src/users/dto/update-user.dto.ts
import { IsOptional, IsString, Length, Matches, ValidateIf } from "class-validator";
import { DisplayName } from "./display-name.js";

// Ít nhất một trường (kiểm tra ở service). Không nhận role / refer_user_id / status.
export class UpdateUserDto {
  @IsOptional() @IsString() @Length(6, 20) @Matches(/^\d+$/) phone_number?: string;
  @IsOptional() @IsString() @Length(12, 128) password?: string;
  /** Chuỗi = đặt tên; null = xóa tên (về NULL); bỏ trống = không đổi. */
  @ValidateIf((_, v) => v !== undefined && v !== null) @DisplayName() display_name?: string | null;
}
