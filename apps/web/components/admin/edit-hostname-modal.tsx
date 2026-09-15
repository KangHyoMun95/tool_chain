'use client';

import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { App } from 'antd';
import {
  useUpdateHostname,
  type HostnameRow,
  type UpdateHostnameInput,
} from '@/lib/api/hostname';

export function EditHostnameModal({
  record,
  open,
  onOpenChange,
  onSuccess,
}: {
  record: HostnameRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const { message } = App.useApp();
  const update = useUpdateHostname();
  return (
    <ModalForm<UpdateHostnameInput>
      title={record ? `Sửa trang chủ: ${record.name}` : 'Sửa trang chủ'}
      open={open}
      onOpenChange={onOpenChange}
      modalProps={{ destroyOnClose: true }}
      initialValues={{ name: record?.name, url: record?.url }}
      onFinish={async (values) => {
        if (!record) return false;
        try {
          await update.mutateAsync({ id: record.id, ...values });
          message.success('Đã cập nhật trang chủ');
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Cập nhật thất bại');
          return false;
        }
      }}
    >
      <ProFormText name="name" label="Tên trang chủ" rules={[{ max: 255 }]} />
      <ProFormText name="url" label="URL" rules={[{ max: 1024 }]} />
    </ModalForm>
  );
}
