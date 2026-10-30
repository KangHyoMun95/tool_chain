// src/users/dto/update-user-status.dto.ts
import { IsEnum, Matches } from "class-validator";
import { UserStatus } from "@toolhackchain/shared";

export class UserIdParamDto {
  @Matches(/^\d{1,19}$/) userId!: string;
}

export class UpdateUserStatusDto {
  @IsEnum(UserStatus) status!: UserStatus;
}
