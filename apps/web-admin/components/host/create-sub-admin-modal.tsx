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
