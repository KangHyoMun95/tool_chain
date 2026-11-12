'use client';

import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { App } from 'antd';
import {
  useUpdateSubAdmin,
  type SubAdminRow,
  type UpdateSubAdminInput,
} from '@/lib/api/sub-admin';

export function EditSubAdminModal({
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
  const update = useUpdateSubAdmin();

  return (
    <ModalForm<UpdateSubAdminInput>
      title={record ? `Sửa Admin Con: ${record.username}` : 'Sửa Admin Con'}
      open={open}
      onOpenChange={onOpenChange}
      modalProps={{ destroyOnClose: true }}
      initialValues={{ displayName: record?.displayName ?? undefined, phoneNumber: record?.phoneNumber ?? undefined }}
      onFinish={async (values) => {
        if (!record) return false;
        const payload: UpdateSubAdminInput = {};
        if (values.password) payload.password = values.password;
        const nextName = (values.displayName ?? '').trim();
        if (nextName !== (record.displayName ?? '')) payload.displayName = nextName || null;
        if ((values.phoneNumber ?? '') !== (record.phoneNumber ?? '')) {
          payload.phoneNumber = values.phoneNumber ?? '';
        }
        try {
          await update.mutateAsync({ id: record.id, ...payload });
          message.success('Đã cập nhật Admin Con');
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Cập nhật thất bại');
          return false;
        }
      }}
    >
      <ProFormText
        name="displayName"
        label="Tên hiển thị"
        placeholder="Không bắt buộc"
        rules={[{ max: 50, message: 'Tối đa 50 ký tự' }]}
      />
      <ProFormText
        name="phoneNumber"
        label="Số điện thoại"
        rules={[{ pattern: /^\d{6,20}$/, message: 'Chỉ chữ số, 6–20 ký tự' }]}
      />
      <ProFormText.Password
        name="password"
        label="Mật khẩu mới"
        placeholder="Để trống nếu không đổi"
        rules={[{ min: 12, message: 'Tối thiểu 12 ký tự' }]}
      />
    </ModalForm>
  );
}
