// src/users/dto/update-user-status.dto.ts
import { IsEnum, IsUUID } from "class-validator";
import { UserStatus } from "@toolhackchain/shared";

export class UserIdParamDto {
  @IsUUID() userId!: string;
}

export class UpdateUserStatusDto {
  @IsEnum(UserStatus) status!: UserStatus;
}
