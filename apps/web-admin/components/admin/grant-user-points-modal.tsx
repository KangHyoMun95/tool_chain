'use client';

import {
  ModalForm,
  ProFormDigit,
} from '@ant-design/pro-components';
import { App } from 'antd';
import {
  useGrantUserPoints,
  type GrantUserPointsInput,
  type UserRow,
} from '@/lib/api/user';

/** Controlled "Cấp điểm" modal for a User: chỉ cộng điểm cho cấp dưới trực tiếp. */
export function GrantUserPointsModal({
  record,
  open,
  onOpenChange,
  onSuccess,
}: {
  record: UserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const { message } = App.useApp();
  const grant = useGrantUserPoints();

  return (
    <ModalForm<GrantUserPointsInput>
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
