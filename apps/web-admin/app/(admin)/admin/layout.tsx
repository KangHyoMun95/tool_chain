'use client';

import { Role } from '@toolhackchain/shared';
import { AppProLayout } from '@/components/shared/AppProLayout';
import { RoleGuard } from '@/components/shared/RoleGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={[Role.ADMIN_CON]}>
      <AppProLayout>{children}</AppProLayout>
    </RoleGuard>
  );
}
