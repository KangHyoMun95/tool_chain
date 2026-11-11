'use client';

import { PageContainer } from '@ant-design/pro-components';
import { Button, Result } from 'antd';
import Link from 'next/link';

/** Trang chưa có API phía sau (API không có endpoint tương ứng): sẽ được dựng lại khi API sẵn sàng. */
export function Unsupported({ title, backHref }: { title: string; backHref: string }) {
  return (
    <PageContainer title={title}>
      <Result
        status="info"
        title="Chưa hỗ trợ"
        subTitle="Tính năng này chưa có API tương ứng và đang được xây dựng lại."
        extra={
          <Link href={backHref}>
            <Button type="primary">Về trang chính</Button>
          </Link>
        }
      />
    </PageContainer>
  );
}
