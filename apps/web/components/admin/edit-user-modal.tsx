'use client';

import { ModalForm, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { App } from 'antd';
import { useHostnames } from '@/lib/api/hostname';
import {
  useSetUserHostnames,
  useUpdateUser,
  type UpdateUserInput,
  type UserRow,
} from '@/lib/api/user';

interface FormValues extends UpdateUserInput {
  hostnameIds?: string[];
}

/** Controlled edit modal for a User, incl. hostname multi-select. */
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
  const setHostnames = useSetUserHostnames();
  const { data: hostnames } = useHostnames();

  return (
    <ModalForm<FormValues>
      title={record ? `Sửa người dùng: ${record.username}` : 'Sửa người dùng'}
      open={open}
      onOpenChange={onOpenChange}
      modalProps={{ destroyOnClose: true }}
      initialValues={{
        username: record?.username,
        phoneNumber: record?.phoneNumber ?? undefined,
        hostnameIds: record?.hostnames?.map((h) => h.id) ?? [],
      }}
      onFinish={async ({ hostnameIds, ...values }) => {
        if (!record) return false;
        const payload: UpdateUserInput = {};
        if (values.username && values.username !== record.username) {
          payload.username = values.username;
        }
        if (values.password) payload.password = values.password;
        if ((values.phoneNumber ?? '') !== (record.phoneNumber ?? '')) {
          payload.phoneNumber = values.phoneNumber ?? '';
        }
        try {
          if (Object.keys(payload).length) {
            await update.mutateAsync({ id: record.id, ...payload });
          }
          const currentIds = (record.hostnames ?? []).map((h) => h.id).sort();
          const nextIds = (hostnameIds ?? []).slice().sort();
          if (JSON.stringify(currentIds) !== JSON.stringify(nextIds)) {
            await setHostnames.mutateAsync({ id: record.id, hostnameIds: hostnameIds ?? [] });
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
      <ProFormText name="username" label="Tên đăng nhập" rules={[{ min: 3 }]} />
      <ProFormText.Password
        name="password"
        label="Mật khẩu mới"
        placeholder="Để trống nếu không đổi"
        rules={[{ min: 6 }]}
      />
      <ProFormText
        name="phoneNumber"
        label="Số điện thoại"
        rules={[{ max: 20, message: 'Tối đa 20 ký tự' }]}
      />
      <ProFormSelect
        name="hostnameIds"
        label="Trang chủ"
        mode="multiple"
        placeholder="Chọn trang chủ gắn cho user"
        options={(hostnames ?? []).map((h) => ({ label: h.name, value: h.id }))}
      />
    </ModalForm>
  );
}
