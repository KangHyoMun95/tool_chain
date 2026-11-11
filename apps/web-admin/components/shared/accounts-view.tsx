'use client';

import { ProCard, ProForm, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { Alert, App, Descriptions } from 'antd';
import { useState } from 'react';
import { UserStatus } from '@toolhackchain/shared';
import { useCreateAccount, useUpdateAccountStatus, type CreateAccountInput, type CreatedAccount } from '@/lib/api/accounts';
import { ROLE, type Role } from '@/lib/auth/roles';

const STATUS_LABEL: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: 'Hoạt động (ACTIVE)',
  [UserStatus.DEACTIVE]: 'Hủy kích hoạt (DEACTIVE)',
  [UserStatus.DELETED]: 'Xóa (DELETED, không hoàn tác)',
};

/** Role mà actor tạo được và các trạng thái actor được đặt (xóa mềm chỉ ADMIN). */
const BY_ROLE: Partial<Record<Role, { creates: string; statuses: UserStatus[] }>> = {
  [ROLE.HOST]: { creates: 'Admin Con', statuses: [UserStatus.ACTIVE, UserStatus.DEACTIVE] },
  [ROLE.ADMIN]: { creates: 'User', statuses: [UserStatus.ACTIVE, UserStatus.DEACTIVE, UserStatus.DELETED] },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tài khoản cấp dưới theo API hiện có: tạo tài khoản (POST /users) và đổi trạng thái theo id (PATCH /users/:id/status).
 * Chưa có API liệt kê tài khoản nên chưa có bảng danh sách; id lấy từ kết quả tạo.
 */
export function AccountsView({ role }: { role: Role }) {
  const { message } = App.useApp();
  const create = useCreateAccount();
  const updateStatus = useUpdateAccountStatus();
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const cfg = BY_ROLE[role];
  if (!cfg) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ProCard title={`Tạo tài khoản ${cfg.creates}`} headerBordered>
        <ProForm<CreateAccountInput>
          layout="vertical"
          submitter={{ searchConfig: { submitText: 'Tạo tài khoản' }, resetButtonProps: false }}
          onFinish={async (values) => {
            try {
              const res = await create.mutateAsync(values);
              setCreated(res);
              message.success(`Đã tạo ${cfg.creates}`);
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
              { pattern: /^\d{6,20}$/, message: 'Số điện thoại gồm 6–20 chữ số' },
            ]}
          />
          <ProFormText.Password
            name="password"
            label="Mật khẩu"
            rules={[
              { required: true, message: 'Nhập mật khẩu' },
              { min: 12, message: 'Mật khẩu tối thiểu 12 ký tự' },
            ]}
          />
        </ProForm>
        {created && (
          <Alert
            style={{ marginTop: 16 }}
            type="success"
            showIcon
            message="Tài khoản vừa tạo"
            description={
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="ID">
                  <code>{created.user_id}</code>
                </Descriptions.Item>
                <Descriptions.Item label="Số điện thoại">{created.phone_number}</Descriptions.Item>
                <Descriptions.Item label="Vai trò">{created.role}</Descriptions.Item>
              </Descriptions>
            }
          />
        )}
      </ProCard>

      <ProCard title="Đổi trạng thái tài khoản" headerBordered>
        <ProForm<{ userId: string; status: UserStatus }>
          layout="vertical"
          initialValues={{ userId: '', status: UserStatus.DEACTIVE }}
          submitter={{ searchConfig: { submitText: 'Cập nhật' }, resetButtonProps: false }}
          onFinish={async (values) => {
            try {
              await updateStatus.mutateAsync(values);
              message.success('Đã cập nhật trạng thái');
              return true;
            } catch (err) {
              message.error(err instanceof Error ? err.message : 'Cập nhật thất bại');
              return false;
            }
          }}
        >
          <ProFormText
            name="userId"
            label="ID tài khoản"
            placeholder="UUID của tài khoản cấp dưới trực tiếp"
            rules={[
              { required: true, message: 'Nhập ID tài khoản' },
              { pattern: UUID_RE, message: 'ID phải là UUID' },
            ]}
          />
          <ProFormSelect
            name="status"
            label="Trạng thái"
            allowClear={false}
            options={cfg.statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            rules={[{ required: true }]}
          />
        </ProForm>
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message="Hủy kích hoạt / xóa sẽ đăng xuất tài khoản đó ngay. Chỉ đổi được tài khoản cấp dưới trực tiếp của bạn."
        />
      </ProCard>
    </div>
  );
}
