// src/users/dto/password.ts
import { applyDecorators } from "@nestjs/common";
import { IsString, Length } from "class-validator";

/** Quy tắc mật khẩu dùng chung (ADMIN tạo user, tự đăng ký): 12–128 ký tự. Hash bằng ARGON2_OPTIONS (auth/password.ts). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const Password = () => applyDecorators(IsString(), Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH));
