// packages/shared/src/auth.ts
export const ROLES = ["HOST", "ADMIN", "USER"] as const;
export type Role = (typeof ROLES)[number];

// user_id cố định của ADMIN chính (UUID v4). Không nằm trong migration: tạo bằng CLI
// `create-user --role ADMIN --fixed-admin-id` (xem CLAUDE.md). role_id của các role do DB tự sinh, không có hằng số.
export const MAIN_ADMIN_USER_ID = "9ba6b144-782a-4eae-a8bd-b1d9f3866285";
