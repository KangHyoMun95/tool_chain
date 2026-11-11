'use client';

import { PageContainer } from '@ant-design/pro-components';
import { AccountsView } from '@/components/shared/accounts-view';
import { ROLE } from '@/lib/auth/roles';

export default function AccountsPage() {
  return (
    <PageContainer title="Tài khoản">
      <AccountsView role={ROLE.HOST} />
    </PageContainer>
  );
}
