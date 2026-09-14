'use client';

import { PageContainer } from '@ant-design/pro-components';
import { AdminConTable } from '@/components/host/admin-con-table';

export default function HostAdminsPage() {
  return (
    <PageContainer title="Quản lý Admin Con">
      <AdminConTable />
    </PageContainer>
  );
}
