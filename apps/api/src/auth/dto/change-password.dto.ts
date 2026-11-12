// src/auth/dto/change-password.dto.ts
import { IsString, Length } from "class-validator";

export class ChangePasswordDto {
  @IsString() @Length(1, 128) current_password!: string;
  // Cùng rule với tạo user / sửa user: tối thiểu 12 ký tự.
  @IsString() @Length(12, 128) new_password!: string;
}
