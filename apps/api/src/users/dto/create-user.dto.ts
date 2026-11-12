// src/users/dto/create-user.dto.ts
import { IsOptional, IsString, Length } from "class-validator";
import { DisplayName } from "./display-name.js";

// Không nhận role / refer_user_id từ client: role suy ra từ người gọi, cấp trên luôn là người gọi.
export class CreateUserDto {
  @IsString() @Length(6, 20) phone_number!: string;
  @IsString() @Length(12, 128) password!: string;
  @IsOptional() @DisplayName() display_name?: string;
}
