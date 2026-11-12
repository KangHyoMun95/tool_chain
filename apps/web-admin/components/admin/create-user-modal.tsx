'use client';

import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { App, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useCreateUser, type CreateUserInput } from '@/lib/api/user';

export function CreateUserModal({ onSuccess }: { onSuccess?: () => void }) {
  const { message } = App.useApp();
  const create = useCreateUser();

  return (
    <ModalForm<CreateUserInput>
      title="Tạo người dùng"
      trigger={
        <Button type="primary" icon={<PlusOutlined />}>
          Tạo người dùng
        </Button>
      }
      modalProps={{ destroyOnClose: true }}
      onFinish={async (input) => {
        try {
          await create.mutateAsync({ ...input, display_name: input.display_name?.trim() || undefined });
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
        name="display_name"
        label="Tên hiển thị"
        placeholder="Không bắt buộc"
        rules={[{ max: 50, message: 'Tối đa 50 ký tự' }]}
      />
      <ProFormText
        name="phone_number"
        label="Số điện thoại"
        rules={[
          { required: true, message: 'Nhập số điện thoại' },
          { pattern: /^\d{6,20}$/, message: 'Chỉ chữ số, 6–20 ký tự' },
        ]}
      />
      <ProFormText.Password
        name="password"
        label="Mật khẩu"
        rules={[{ required: true, message: 'Nhập mật khẩu' }, { min: 12, message: 'Tối thiểu 12 ký tự' }]}
      />
    </ModalForm>
  );
}
