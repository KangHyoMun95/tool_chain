// src/auth/dto/login.dto.ts
import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class LoginDto {
  @IsString() @Length(6, 20) phone_number!: string;
  @IsString() @Length(1, 128) password!: string;
  /**
   * "portal": chỉ role USER được đăng nhập. "admin": chỉ HOST / ADMIN. Role không khớp nhận cùng lỗi 401 như sai mật khẩu
   * (không tạo session). Bỏ trống ⇒ không hạn chế.
   */
  @IsOptional() @IsIn(["portal", "admin"]) audience?: "portal" | "admin";
}
