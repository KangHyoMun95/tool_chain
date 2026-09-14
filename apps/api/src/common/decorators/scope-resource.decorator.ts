import { SetMetadata } from '@nestjs/common';
import { SCOPE_RESOURCE_KEY } from '../constants';

export type ScopedResourceType = 'user' | 'adminCon';

export interface ScopeResourceOptions {
  /** Which kind of resource the route param points at. */
  type: ScopedResourceType;
  /** Name of the route param holding the resource id (default: 'id'). */
  idParam?: string;
}

/**
 * Declares that a route operates on a specific resource whose ownership must be
 * scoped to the caller's tier. Enforced by ResourceScopeGuard so an Admin(Con)
 * can never touch another Admin(Con)'s data (see CLAUDE.md).
 */
export const ScopeResource = (options: ScopeResourceOptions) =>
  SetMetadata(SCOPE_RESOURCE_KEY, { idParam: 'id', ...options });
