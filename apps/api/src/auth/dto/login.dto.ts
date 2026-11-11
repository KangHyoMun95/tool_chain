// src/auth/dto/login.dto.ts
import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class LoginDto {
  @IsString() @Length(6, 20) phone_number!: string;
  @IsString() @Length(1, 128) password!: string;
  /** "portal": chỉ role USER được đăng nhập (HOST / ADMIN nhận cùng lỗi 401 như sai mật khẩu, không tạo session). */
  @IsOptional() @IsIn(["portal"]) audience?: "portal";
}
