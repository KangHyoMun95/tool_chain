'use client';

import { PageContainer } from '@ant-design/pro-components';
import { DashboardView } from '@/components/shared/dashboard-view';

export default function DashboardPage() {
  return (
    <PageContainer title="Dashboard">
      <DashboardView />
    </PageContainer>
  );
}
