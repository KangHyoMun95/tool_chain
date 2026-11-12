'use client';

import { ModalForm, ProFormText } from '@ant-design/pro-components';
import { App } from 'antd';
import { changePassword, MIN_PASSWORD_LENGTH } from '@/lib/api/change-password';

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Đổi mật khẩu của chính mình: mật khẩu cũ, mật khẩu mới (>= 12 ký tự), xác nhận. Server kiểm tra lại mọi điều kiện. */
export function ChangePasswordModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { message } = App.useApp();

  return (
    <ModalForm<FormValues>
      title="Đổi mật khẩu"
      open={open}
      onOpenChange={onOpenChange}
      width={420}
      modalProps={{ destroyOnClose: true }}
      onFinish={async (values) => {
        try {
          await changePassword(values.currentPassword, values.newPassword);
          message.success('Đã đổi mật khẩu');
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Đổi mật khẩu thất bại');
          return false;
        }
      }}
    >
      <ProFormText.Password
        name="currentPassword"
        label="Mật khẩu cũ"
        fieldProps={{ autoComplete: 'current-password', maxLength: 128 }}
        rules={[{ required: true, message: 'Nhập mật khẩu cũ' }]}
      />
      <ProFormText.Password
        name="newPassword"
        label="Mật khẩu mới"
        fieldProps={{ autoComplete: 'new-password', maxLength: 128 }}
        dependencies={['currentPassword']}
        rules={[
          { required: true, message: 'Nhập mật khẩu mới' },
          { min: MIN_PASSWORD_LENGTH, message: `Tối thiểu ${MIN_PASSWORD_LENGTH} ký tự` },
          ({ getFieldValue }) => ({
            validator: (_rule, value) =>
              !value || value !== getFieldValue('currentPassword')
                ? Promise.resolve()
                : Promise.reject(new Error('Mật khẩu mới phải khác mật khẩu cũ')),
          }),
        ]}
      />
      <ProFormText.Password
        name="confirmPassword"
        label="Xác nhận mật khẩu mới"
        fieldProps={{ autoComplete: 'new-password', maxLength: 128 }}
        dependencies={['newPassword']}
        rules={[
          { required: true, message: 'Xác nhận mật khẩu mới' },
          ({ getFieldValue }) => ({
            validator: (_rule, value) =>
              !value || value === getFieldValue('newPassword')
                ? Promise.resolve()
                : Promise.reject(new Error('Xác nhận mật khẩu không khớp')),
          }),
        ]}
      />
    </ModalForm>
  );
}
