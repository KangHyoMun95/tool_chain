'use client';

import {
  ModalForm,
  ProFormDigit,
} from '@ant-design/pro-components';
import { App } from 'antd';
import {
  useGrantPoints,
  type SubAdminRow,
  type GrantPointsInput,
} from '@/lib/api/sub-admin';

export function GrantPointsModal({
  record,
  open,
  onOpenChange,
  onSuccess,
}: {
  record: SubAdminRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const { message } = App.useApp();
  const grant = useGrantPoints();

  return (
    <ModalForm<GrantPointsInput>
      title={record ? `Cấp điểm: ${record.username}` : 'Cấp điểm'}
      open={open}
      onOpenChange={onOpenChange}
      modalProps={{ destroyOnClose: true }}
      onFinish={async (values) => {
        if (!record) return false;
        try {
          await grant.mutateAsync({ id: record.id, ...values });
          message.success('Đã cấp điểm');
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Cấp điểm thất bại');
          return false;
        }
      }}
    >
      <ProFormDigit
        name="amount"
        label="Số điểm"
        min={1}
        fieldProps={{ precision: 0 }}
        rules={[{ required: true, message: 'Nhập số điểm' }]}
      />
    </ModalForm>
  );
}
