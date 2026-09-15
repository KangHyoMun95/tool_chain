'use client';

import { PageContainer } from '@ant-design/pro-components';
import { HostnameTable } from '@/components/admin/hostname-table';

export default function AdminHostnamesPage() {
  return (
    <PageContainer title="Quản lý trang chủ">
      <HostnameTable />
    </PageContainer>
  );
}
