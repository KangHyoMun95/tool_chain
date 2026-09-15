'use client';

import { PageContainer } from '@ant-design/pro-components';
import { SubAdminTable } from '@/components/host/sub-admin-table';

export default function HostAdminsPage() {
  return (
    <PageContainer title="Quản lý người dùng">
      <SubAdminTable />
    </PageContainer>
  );
}
