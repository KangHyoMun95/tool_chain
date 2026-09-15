'use client';

import { ModalForm, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { App, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useHostnames } from '@/lib/api/hostname';
import {
  useCreateUser,
  useSetUserHostnames,
  type CreateUserInput,
} from '@/lib/api/user';

interface FormValues extends CreateUserInput {
  hostnameIds?: string[];
}

/** "Tạo người dùng" — ProForm inside a Modal, with hostname multi-select. */
export function CreateUserModal({ onSuccess }: { onSuccess?: () => void }) {
  const { message } = App.useApp();
  const create = useCreateUser();
  const setHostnames = useSetUserHostnames();
  const { data: hostnames } = useHostnames();

  return (
    <ModalForm<FormValues>
      title="Tạo người dùng"
      trigger={
        <Button type="primary" icon={<PlusOutlined />}>
          Tạo người dùng
        </Button>
      }
      modalProps={{ destroyOnClose: true }}
      onFinish={async ({ hostnameIds, ...input }) => {
        try {
          const created = await create.mutateAsync(input);
          if (hostnameIds && hostnameIds.length) {
            await setHostnames.mutateAsync({ id: created.id, hostnameIds });
          }
          message.success('Đã tạo người dùng');
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Tạo thất bại');
          return false;
        }
      }}
    >
      <ProFormText
        name="username"
        label="Tên đăng nhập"
        rules={[{ required: true, message: 'Nhập tên đăng nhập' }, { min: 3 }]}
      />
      <ProFormText.Password
        name="password"
        label="Mật khẩu"
        rules={[{ required: true, message: 'Nhập mật khẩu' }, { min: 6 }]}
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
