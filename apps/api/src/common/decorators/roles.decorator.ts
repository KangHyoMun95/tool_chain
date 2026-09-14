import { SetMetadata } from '@nestjs/common';
import { Role } from '@toolhackchain/shared';
import { ROLES_KEY } from '../constants';

/** Restricts a route to one or more roles. Enforced by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
