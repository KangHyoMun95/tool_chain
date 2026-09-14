'use client';

import {
  ModalForm,
  ProFormDigit,
  ProFormSelect,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { App } from 'antd';
import { PointDirection } from '@toolhackchain/shared';
import {
  useGrantPoints,
  type AdminConRow,
  type GrantPointsInput,
} from '@/lib/api/admin-con';

/** Controlled "Cấp điểm" modal: amount + direction + reason. */
export function GrantPointsModal({
  record,
  open,
  onOpenChange,
  onSuccess,
}: {
  record: AdminConRow | null;
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
      initialValues={{ direction: PointDirection.CREDIT }}
      onFinish={async (values) => {
        if (!record) return false;
        try {
          await grant.mutateAsync({ id: record.id, ...values });
          message.success('Đã cập nhật điểm');
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Cấp điểm thất bại');
          return false;
        }
      }}
    >
      <ProFormSelect
        name="direction"
        label="Loại"
        rules={[{ required: true }]}
        options={[
          { label: 'Cộng điểm', value: PointDirection.CREDIT },
          { label: 'Trừ điểm', value: PointDirection.DEBIT },
        ]}
      />
      <ProFormDigit
        name="amount"
        label="Số điểm"
        min={1}
        fieldProps={{ precision: 0 }}
        rules={[{ required: true, message: 'Nhập số điểm' }]}
      />
      <ProFormTextArea
        name="reason"
        label="Lý do"
        placeholder="Ghi chú lý do (tuỳ chọn)"
      />
    </ModalForm>
  );
}
