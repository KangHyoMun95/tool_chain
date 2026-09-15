'use client';

import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { App } from 'antd';
import {
  useUpdateSubAdmin,
  type SubAdminRow,
  type UpdateSubAdminInput,
} from '@/lib/api/sub-admin';

/** Controlled edit modal for a single Admin(Con). */
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
      initialValues={{ username: record?.username }}
      onFinish={async (values) => {
        if (!record) return false;
        // Only send fields that were actually filled in.
        const payload: UpdateSubAdminInput = {};
        if (values.username && values.username !== record.username) {
          payload.username = values.username;
        }
        if (values.password) payload.password = values.password;
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
        name="username"
        label="Tên đăng nhập"
        rules={[{ min: 3 }]}
      />
      <ProFormText.Password
        name="password"
        label="Mật khẩu mới"
        placeholder="Để trống nếu không đổi"
        rules={[{ min: 6 }]}
      />
    </ModalForm>
  );
}
