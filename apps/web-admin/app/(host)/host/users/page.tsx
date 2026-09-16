'use client';

import { PageContainer } from '@ant-design/pro-components';
import { UserHierarchyTable } from '@/components/host/user-hierarchy-table';

export default function HostUsersPage() {
  return (
    <PageContainer title="Quản lý User">
      <UserHierarchyTable />
    </PageContainer>
  );
}
