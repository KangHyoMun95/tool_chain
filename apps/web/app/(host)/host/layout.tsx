'use client';

import { Role } from '@toolhackchain/shared';
import { AppProLayout } from '@/components/shared/AppProLayout';
import { RoleGuard } from '@/components/shared/RoleGuard';

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={[Role.HOST]}>
      <AppProLayout>{children}</AppProLayout>
    </RoleGuard>
  );
}
