// src/users-register/dto/activate-register.dto.ts
import { IsOptional, IsString, IsUUID, Length } from "class-validator";
import { DisplayName } from "../../users/dto/display-name.js";

export class RegisterIdParamDto {
  @IsUUID() id!: string;
}

// Role (USER) và trạng thái do server quyết định; chỉ nhận Admin cha, mật khẩu và tên hiển thị tùy chọn.
export class ActivateRegisterDto {
  @IsUUID() admin_id!: string;
  @IsString() @Length(12, 128) password!: string;
  @IsOptional() @DisplayName() display_name?: string;
}
