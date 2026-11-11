'use client';

import { ROLE } from '@/lib/auth/roles';
import { AppProLayout } from '@/components/shared/AppProLayout';
import { RoleGuard } from '@/components/shared/RoleGuard';

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={[ROLE.HOST]}>
      <AppProLayout>{children}</AppProLayout>
    </RoleGuard>
  );
}
