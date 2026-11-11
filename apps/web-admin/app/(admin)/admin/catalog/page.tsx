'use client';

import { PageContainer } from '@ant-design/pro-components';
import { StreamCatalog } from '@/components/shared/stream-catalog';

export default function CatalogPage() {
  return (
    <PageContainer title="Danh sách bàn">
      <StreamCatalog />
    </PageContainer>
  );
}
