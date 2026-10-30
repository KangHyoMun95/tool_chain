// packages/shared/src/auth.ts
export const ROLES = ["HOST", "ADMIN", "USER"] as const;
export type Role = (typeof ROLES)[number];
