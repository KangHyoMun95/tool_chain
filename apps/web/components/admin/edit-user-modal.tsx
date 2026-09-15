'use client';

import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { App } from 'antd';
import { useUpdateUser, type UpdateUserInput, type UserRow } from '@/lib/api/user';

/** Controlled edit modal for a single User. */
export function EditUserModal({
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
  const update = useUpdateUser();

  return (
    <ModalForm<UpdateUserInput>
      title={record ? `Sửa User: ${record.username}` : 'Sửa User'}
      open={open}
      onOpenChange={onOpenChange}
      modalProps={{ destroyOnClose: true }}
      initialValues={{ username: record?.username }}
      onFinish={async (values) => {
        if (!record) return false;
        const payload: UpdateUserInput = {};
        if (values.username && values.username !== record.username) {
          payload.username = values.username;
        }
        if (values.password) payload.password = values.password;
        try {
          await update.mutateAsync({ id: record.id, ...payload });
          message.success('Đã cập nhật User');
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Cập nhật thất bại');
          return false;
        }
      }}
    >
      <ProFormText name="username" label="Tên đăng nhập" rules={[{ min: 3 }]} />
      <ProFormText.Password
        name="password"
        label="Mật khẩu mới"
        placeholder="Để trống nếu không đổi"
        rules={[{ min: 6 }]}
      />
    </ModalForm>
  );
}
