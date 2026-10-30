// src/auth/auth.types.ts
import type { Role } from "@toolhackchain/shared";

export type AuthUser = { userId: string; role: Role; sessionId: string };

export type SessionRecord = { user_id: string; role: Role; created_at: number };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
