'use client';

import { PageContainer } from '@ant-design/pro-components';
import { NewUserTable } from '@/components/host/new-user-table';

export default function HostNewUsersPage() {
  return (
    <PageContainer title="Quản lý người mới">
      <NewUserTable />
    </PageContainer>
  );
}
