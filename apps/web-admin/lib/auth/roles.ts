import type { Role } from '@toolhackchain/shared';

export type { Role };

/** Giá trị runtime của role (shared chỉ xuất type `Role` và mảng `ROLES`). */
export const ROLE = { HOST: 'HOST', ADMIN: 'ADMIN', USER: 'USER' } as const satisfies Record<Role, Role>;

/** web-admin chỉ dành cho HOST và ADMIN; USER dùng web-portal. */
export const ADMIN_APP_ROLES: readonly Role[] = [ROLE.HOST, ROLE.ADMIN];
