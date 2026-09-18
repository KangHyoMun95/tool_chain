'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { JwtPayload, Role } from '@toolhackchain/shared';
import { clearSession, getStoredUsername, getToken } from '../api/client';

export interface CurrentUser {
  sub: string;
  role: Role;
  /** Display name (username entered at login); falls back to a short id. */
  username: string;
}

/** Vietnamese labels for each role, shown in the header. */
export const ROLE_LABEL: Record<Role, string> = {
  [Role.HOST]: 'Admin Host',
  [Role.ADMIN_CON]: 'Admin Con',
  [Role.USER]: 'User',
};

/** The landing route for each role. */
export function homeForRole(role: Role): string {
  switch (role) {
    case Role.HOST:
      return '/host/admins';
    case Role.ADMIN_CON:
      return '/admin/users';
    default:
      return '/';
  }
}

/**
 * Decodes the JWT payload client-side. Returns null when the token is invalid,
 * missing required claims, or already expired (`exp` is in the past) — callers
 * then treat it as unauthenticated and send the user back to /login.
 */
function decodeJwt(token: string): Pick<JwtPayload, 'sub' | 'role'> | null {
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    );
    if (typeof json?.exp === 'number' && json.exp * 1000 <= Date.now()) {
      return null;
    }
    if (json?.sub && json?.role) return { sub: json.sub, role: json.role };
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads the current user from the stored JWT on the client. isLoading stays
 * true until the effect runs, to avoid an SSR/hydration mismatch.
 */
export function useCurrentUser(): { user: CurrentUser | null; isLoading: boolean } {
  const [state, setState] = useState<{
    user: CurrentUser | null;
    isLoading: boolean;
  }>({ user: null, isLoading: true });

  useEffect(() => {
    const token = getToken();
    const claims = token ? decodeJwt(token) : null;
    if (!claims) {
      // A stored-but-unusable token (invalid / expired) is cleared so it does
      // not linger; RoleGuard will send the user to /login.
      if (token) clearSession();
      setState({ user: null, isLoading: false });
      return;
    }
    setState({
      user: {
        sub: claims.sub,
        role: claims.role,
        username: getStoredUsername() ?? `#${claims.sub.slice(0, 8)}`,
      },
      isLoading: false,
    });
  }, []);

  return state;
}

/** Clears the session and returns to the login page. */
export function useLogout(): () => void {
  const router = useRouter();
  return () => {
    clearSession();
    router.replace('/login');
  };
}
