'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { Role } from '@toolhackchain/shared';
import { homeForRole, useCurrentUser } from '@/lib/auth/current-user';

/**
 * Client-side role gate for a route group's layout. Redirects to /login when
 * unauthenticated, or to the caller's own home when the role is not allowed.
 * Role checks live here (per the nextjs-frontend skill), not in each page.
 */
export function RoleGuard({
  allow,
  children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
    } else if (!allow.includes(user.role)) {
      router.replace(homeForRole(user.role));
    }
  }, [isLoading, user, allow, router]);

  if (isLoading || !user || !allow.includes(user.role)) {
    return <Spin spinning fullscreen tip="Đang tải..." />;
  }
  return <>{children}</>;
}
