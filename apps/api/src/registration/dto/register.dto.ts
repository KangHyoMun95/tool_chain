// src/registration/dto/register.dto.ts
import { IsString, Matches, MaxLength } from "class-validator";
import { DisplayName } from "../../users/dto/display-name.js";
import { Password } from "../../users/dto/password.js";
import { IsOptional } from "class-validator";

// Số điện thoại tự đăng ký: chỉ chữ số, 6–20 ký tự (portal tự bỏ khoảng trắng / dấu "-" trước khi gửi).
export const PHONE_PATTERN = /^\d{6,20}$/;

// Role (USER), cấp trên (MAIN_ADMIN_USER_ID) và trạng thái do server quyết định; body không nhận các trường đó.
export class RegisterDto {
  @IsString() @Matches(PHONE_PATTERN, { message: "phone_number must be 6-20 digits" }) phone_number!: string;
  @IsOptional() @DisplayName() display_name?: string;
  @Password() password!: string;
  @IsString() @MaxLength(128) confirm_password!: string;
  /** Lời giải ALTCHA (base64 của JSON {algorithm, challenge, number, salt, signature}). */
  @IsString() @MaxLength(2048) altcha!: string;
}
