import { Injectable } from '@nestjs/common';
import { Role } from '@toolhackchain/shared';

@Injectable()
export class AppService {
  health(): { status: string; roles: Role[] } {
    return { status: 'ok', roles: Object.values(Role) };
  }
}
