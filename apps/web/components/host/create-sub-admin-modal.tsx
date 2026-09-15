'use client';

import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { App, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useCreateSubAdmin, type CreateSubAdminInput } from '@/lib/api/sub-admin';

/** "Tạo Admin Con" — ProForm inside a Modal. */
export function CreateSubAdminModal({ onSuccess }: { onSuccess?: () => void }) {
  const { message } = App.useApp();
  const create = useCreateSubAdmin();

  return (
    <ModalForm<CreateSubAdminInput>
      title="Tạo người dùng"
      trigger={
        <Button type="primary" icon={<PlusOutlined />}>
          Tạo người dùng
        </Button>
      }
      modalProps={{ destroyOnClose: true }}
      onFinish={async (values) => {
        try {
          await create.mutateAsync(values);
          message.success('Đã tạo Admin Con');
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
    </ModalForm>
  );
}
