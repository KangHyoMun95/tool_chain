// src/users/dto/create-user.dto.ts
import { IsString, Length } from "class-validator";

// Không nhận role / refer_user_id từ client: role suy ra từ người gọi, cấp trên luôn là người gọi.
export class CreateUserDto {
  @IsString() @Length(6, 20) phone_number!: string;
  @IsString() @Length(12, 128) password!: string;
}
