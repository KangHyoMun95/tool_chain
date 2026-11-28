'use client';

import { PageContainer } from '@ant-design/pro-components';
import { LuckyTimeList } from '@/components/host/no-hu/lucky-time-list';

export default function NoHuListPage() {
  return (
    <PageContainer title="Nổ hũ — Lịch lucky time">
      <LuckyTimeList />
    </PageContainer>
  );
}
