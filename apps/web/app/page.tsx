'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { homeForRole, useCurrentUser } from '@/lib/auth/current-user';

/**
 * Entry route: send unauthenticated visitors to /login, and authenticated ones
 * to their role's home.
 */
export default function IndexPage() {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? homeForRole(user.role) : '/login');
  }, [isLoading, user, router]);

  return <Spin spinning fullscreen tip="Đang tải..." />;
}
