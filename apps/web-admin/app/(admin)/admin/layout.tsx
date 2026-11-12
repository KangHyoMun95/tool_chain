'use client';

import { ROLE } from '@/lib/auth/roles';
import { AppProLayout } from '@/components/shared/AppProLayout';
import { RoleGuard } from '@/components/shared/RoleGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={[ROLE.ADMIN]}>
      <AppProLayout>{children}</AppProLayout>
    </RoleGuard>
  );
}
