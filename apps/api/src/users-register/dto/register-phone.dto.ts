// src/users-register/dto/register-phone.dto.ts
import { IsString, Matches } from "class-validator";

// Cùng quy tắc với phone_number của login / tạo user: chỉ chữ số, 6–20 ký tự (khớp cột VARCHAR(20)).
export const PHONE_PATTERN = /^\d{6,20}$/;

export class RegisterPhoneDto {
  @IsString() @Matches(PHONE_PATTERN, { message: "phone_number must be 6-20 digits" }) phone_number!: string;
}
