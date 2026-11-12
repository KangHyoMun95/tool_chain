// src/users/dto/update-user-status.dto.ts
import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { UserStatus } from "@toolhackchain/shared";

export class UserIdParamDto {
  @IsUUID() userId!: string;
}

export class UpdateUserStatusDto {
  @IsEnum(UserStatus) status!: UserStatus;
  /** Chỉ khi HOST xóa ADMIN (bắt buộc lúc đó): ADMIN nhận bàn giao cấp dưới của ADMIN bị xóa. */
  @IsOptional() @IsUUID() transfer_to_admin_id?: string;
}
