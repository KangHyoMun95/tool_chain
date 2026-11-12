'use client';

import { ModalForm, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { App } from 'antd';
import {
  activateRegistration,
  fetchAdminOptions,
  type RegistrationRow,
} from '@/lib/api/registrations';

interface FormValues {
  phone_number: string;
  display_name?: string;
  admin_id: string;
  password: string;
}

/** Đăng ký người mới: số điện thoại tự điền (không sửa), chọn Admin quản lý, nhập tên hiển thị (tùy chọn) và mật khẩu. */
export function ActivateRegistrationModal({
  record,
  onClose,
  onSuccess,
}: {
  record: RegistrationRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { message } = App.useApp();

  return (
    <ModalForm<FormValues>
      title="Đăng ký người dùng mới"
      open={!!record}
      initialValues={{ phone_number: record?.phoneNumber }}
      modalProps={{ destroyOnClose: true, onCancel: onClose }}
      onOpenChange={(open) => { if (!open) onClose(); }}
      onFinish={async (values) => {
        if (!record) return false;
        try {
          await activateRegistration(record.id, {
            admin_id: values.admin_id,
            password: values.password,
            display_name: values.display_name?.trim() || undefined,
          });
          message.success('Đã đăng ký người dùng');
          onSuccess();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Đăng ký thất bại');
          return false;
        }
      }}
    >
      <ProFormText name="phone_number" label="Số điện thoại" disabled />
      <ProFormSelect
        name="admin_id"
        label="Admin quản lý"
        placeholder="Chọn Admin"
        showSearch
        request={fetchAdminOptions}
        rules={[{ required: true, message: 'Chọn Admin quản lý' }]}
      />
      <ProFormText
        name="display_name"
        label="Tên hiển thị"
        placeholder="Không bắt buộc"
        rules={[{ max: 50, message: 'Tối đa 50 ký tự' }]}
      />
      <ProFormText.Password
        name="password"
        label="Mật khẩu"
        rules={[{ required: true, message: 'Nhập mật khẩu' }, { min: 12, message: 'Tối thiểu 12 ký tự' }]}
      />
    </ModalForm>
  );
}
