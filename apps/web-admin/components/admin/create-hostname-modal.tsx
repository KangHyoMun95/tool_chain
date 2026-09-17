'use client';

import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { App, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useCreateHostname, type CreateHostnameInput } from '@/lib/api/hostname';

export function CreateHostnameModal({ onSuccess }: { onSuccess?: () => void }) {
  const { message } = App.useApp();
  const create = useCreateHostname();
  return (
    <ModalForm<CreateHostnameInput>
      title="Tạo trang chủ"
      trigger={
        <Button type="primary" icon={<PlusOutlined />}>
          Tạo trang chủ
        </Button>
      }
      modalProps={{ destroyOnClose: true }}
      onFinish={async (values) => {
        try {
          await create.mutateAsync(values);
          message.success('Đã tạo trang chủ');
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Tạo thất bại');
          return false;
        }
      }}
    >
      <ProFormText name="name" label="Tên trang chủ" rules={[{ required: true }, { max: 255 }]} />
      <ProFormText name="url" label="URL" rules={[{ required: true }, { max: 1024 }]} />
    </ModalForm>
  );
}
