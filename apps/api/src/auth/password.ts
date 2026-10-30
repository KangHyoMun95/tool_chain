// src/auth/password.ts
// Tách riêng (không import Nest/TypeORM) để CLI dùng được dưới tsx.
import argon2 from "argon2";

// OWASP: argon2id, tối thiểu m=19 MiB, t=2, p=1.
export const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
