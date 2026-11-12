'use client';

import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { App } from 'antd';
import { useUpdateUser, type UpdateUserInput, type UserRow } from '@/lib/api/user';

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
      title={record ? `Sửa người dùng: ${record.username}` : 'Sửa người dùng'}
      open={open}
      onOpenChange={onOpenChange}
      modalProps={{ destroyOnClose: true }}
      initialValues={{
        displayName: record?.displayName ?? undefined,
        phoneNumber: record?.phoneNumber ?? undefined,
      }}
      onFinish={async (values) => {
        if (!record) return false;
        const payload: UpdateUserInput = {};
        if (values.password) payload.password = values.password;
        const nextName = (values.displayName ?? '').trim();
        if (nextName !== (record.displayName ?? '')) payload.displayName = nextName || null;
        if ((values.phoneNumber ?? '') !== (record.phoneNumber ?? '')) {
          payload.phoneNumber = values.phoneNumber ?? '';
        }
        try {
          if (Object.keys(payload).length) {
            await update.mutateAsync({ id: record.id, ...payload });
          }
          message.success('Đã cập nhật người dùng');
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
