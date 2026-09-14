import { IsString, MinLength } from 'class-validator';
import { LoginRequest } from '@toolhackchain/shared';

export class LoginDto implements LoginRequest {
  @IsString()
  @MinLength(1)
  username: string;

  @IsString()
  @MinLength(1)
  password: string;
}
