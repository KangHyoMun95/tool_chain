'use client';

import { PageContainer } from '@ant-design/pro-components';
import { UserTable } from '@/components/admin/user-table';

export default function AdminUsersPage() {
  return (
    <PageContainer title="Quản lý người dùng">
      <UserTable />
    </PageContainer>
  );
}
