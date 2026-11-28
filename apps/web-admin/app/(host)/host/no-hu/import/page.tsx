'use client';

import { PageContainer } from '@ant-design/pro-components';
import { LuckyTimeImport } from '@/components/host/no-hu/lucky-time-import';

export default function NoHuImportPage() {
  return (
    <PageContainer title="Nổ hũ — Import lịch lucky time">
      <LuckyTimeImport />
    </PageContainer>
  );
}
