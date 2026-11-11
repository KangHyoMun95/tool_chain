'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionUser, logout, restoreSession } from '../api/client';
import { ROLE, type Role } from './roles';

export interface CurrentUser {
  sub: string;
  role: Role;
  /** Số điện thoại đăng nhập. */
  username: string;
}

/** Vietnamese labels for each role, shown in the header. */
export const ROLE_LABEL: Record<Role, string> = {
  [ROLE.HOST]: 'Admin Host',
  [ROLE.ADMIN]: 'Admin Con',
  [ROLE.USER]: 'User',
};

/** The landing route for each role. */
export function homeForRole(role: Role): string {
  switch (role) {
    case ROLE.HOST:
      return '/host/accounts';
    case ROLE.ADMIN:
      return '/admin/accounts';
    default:
      return '/login';
  }
}

/**
 * Người dùng hiện tại: dùng phiên trong bộ nhớ, không có thì khôi phục bằng refresh token (xem lib/api/client.ts).
 * isLoading giữ true tới khi xong, tránh lệch SSR / hydration.
 */
export function useCurrentUser(): { user: CurrentUser | null; isLoading: boolean } {
  const [state, setState] = useState<{ user: CurrentUser | null; isLoading: boolean }>({ user: null, isLoading: true });

  useEffect(() => {
    let alive = true;
    void restoreSession().then((ok) => {
      if (!alive) return;
      const s = ok ? getSessionUser() : null;
      setState({ user: s ? { sub: s.sub, role: s.role, username: s.phone } : null, isLoading: false });
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/** Đăng xuất (gọi API) rồi về trang đăng nhập. Lỗi mạng / server ⇒ ném, phiên được giữ. */
export function useLogout(): () => Promise<void> {
  const router = useRouter();
  return async () => {
    await logout();
    router.replace('/login');
  };
}
