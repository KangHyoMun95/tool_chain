'use client';

import {
  ModalForm,
  ProFormDigit,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { App } from 'antd';
import {
  useGrantUserPoints,
  type GrantUserPointsInput,
  type UserRow,
} from '@/lib/api/user';

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
          await grant.mutateAsync({ id: record.id, ...values, reason: values.reason?.trim() || undefined });
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
      <ProFormTextArea
        name="reason"
        label="Nguyên nhân"
        placeholder="Không bắt buộc"
        fieldProps={{ maxLength: 200, showCount: true, autoSize: { minRows: 2, maxRows: 4 } }}
      />
    </ModalForm>
  );
}
