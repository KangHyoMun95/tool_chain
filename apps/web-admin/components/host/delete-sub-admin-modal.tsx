'use client';

import { ModalForm, ProFormSelect } from '@ant-design/pro-components';
import { App } from 'antd';
import { AccountStatus } from '@/lib/legacy-types';
import { fetchManagedUsers, type ManagedUserRow } from '@/lib/api/managed-users';
import { useDeleteUser } from '@/lib/api/user';

/** Admin ACTIVE là con trực tiếp (depth 1), trừ Admin sắp xóa: ứng viên nhận bàn giao. */
async function loadHeirs(excludeId: string) {
  const { rows } = await fetchManagedUsers({ page: 1, limit: 100, role: 'ADMIN', status: AccountStatus.ACTIVE });
  return rows
    .filter((r) => r.depth === 1 && r.id !== excludeId)
    .map((r) => ({ value: r.id, label: r.displayName ? `${r.displayName} (${r.phoneNumber})` : (r.phoneNumber ?? r.id) }));
}

/**
 * HOST xóa Admin: bắt buộc chọn Admin khác nhận bàn giao cấp dưới. Khi xác nhận, API chuyển cấp trên của các user thuộc Admin này sang
 * Admin được chọn, thu hồi điểm còn lại về HOST (giao dịch INVOKE) rồi xóa Admin.
 */
export function DeleteSubAdminModal({
  record,
  onClose,
  onSuccess,
}: {
  record: ManagedUserRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { message } = App.useApp();
  const remove = useDeleteUser();

  return (
    <ModalForm<{ transferToAdminId: string }>
      title={record ? `Xoá "${record.displayName || record.username}"` : 'Xoá người dùng'}
      open={!!record}
      submitter={{ searchConfig: { submitText: 'Xác nhận xoá', resetText: 'Huỷ' }, submitButtonProps: { danger: true } }}
      modalProps={{ destroyOnClose: true, onCancel: onClose }}
      onOpenChange={(open) => { if (!open) onClose(); }}
      onFinish={async ({ transferToAdminId }) => {
        if (!record) return false;
        try {
          await remove.mutateAsync({ id: record.id, transferToAdminId });
          message.success('Đã xoá người dùng');
          onSuccess();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Xoá thất bại');
          return false;
        }
      }}
    >
      <p>
        Tài khoản không thể khôi phục. Điểm còn lại ({record?.points ?? 0}) sẽ được thu hồi về tài khoản của bạn, người dùng thuộc
        Admin này sẽ chuyển sang Admin được chọn bên dưới.
      </p>
      <ProFormSelect
        name="transferToAdminId"
        label="Admin nhận bàn giao"
        placeholder="Chọn Admin"
        showSearch
        request={() => loadHeirs(record?.id ?? '')}
        params={{ id: record?.id }}
        rules={[{ required: true, message: 'Chọn Admin nhận bàn giao' }]}
      />
    </ModalForm>
  );
}
