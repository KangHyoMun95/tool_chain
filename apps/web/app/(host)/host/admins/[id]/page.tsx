'use client';

import { PageContainer } from '@ant-design/pro-components';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SubAdminDetail } from '@/components/host/sub-admin-detail';

export default function SubAdminDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  return (
    <PageContainer
      title="Chi tiết Admin Con"
      extra={[
        <Link key="back" href="/host/admins">
          <Button icon={<ArrowLeftOutlined />}>Về danh sách</Button>
        </Link>,
      ]}
    >
      <SubAdminDetail id={id} />
    </PageContainer>
  );
}
