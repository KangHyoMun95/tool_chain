'use client';

import { useRef, useState } from 'react';
import {
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { App } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { AccountStatus } from '@toolhackchain/shared';
import {
  loadUsers,
  useDeactivateUser,
  useDeleteUser,
  type UserRow,
} from '@/lib/api/user';
import { CreateUserModal } from './create-user-modal';
import { EditUserModal } from './edit-user-modal';
import { GrantUserPointsModal } from './grant-user-points-modal';

export function UserTable() {
  const actionRef = useRef<ActionType>();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const deactivate = useDeactivateUser();
  const remove = useDeleteUser();

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [granting, setGranting] = useState<UserRow | null>(null);

  const reload = () => actionRef.current?.reload();

  const confirmDeactivate = (record: UserRow) => {
    modal.confirm({
      title: 'Deactive User',
      content: `Vô hiệu hoá "${record.username}"? User sẽ không đăng nhập được.`,
      okText: 'Deactive',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await deactivate.mutateAsync(record.id);
          message.success('Đã deactive');
          reload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Deactive thất bại');
          throw err;
        }
      },
    });
  };

  const confirmDelete = (record: UserRow) => {
    modal.confirm({
      title: 'Xoá User',
      content: `Xoá vĩnh viễn "${record.username}"? Hành động không thể hoàn tác.`,
      okText: 'Xoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await remove.mutateAsync(record.id);
          message.success('Đã xoá User');
          reload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Xoá thất bại');
          throw err;
        }
      },
    });
  };

  const columns: ProColumns<UserRow>[] = [
    { title: 'Tên', dataIndex: 'username', ellipsis: true },
    { title: 'Email', dataIndex: 'email', ellipsis: true, renderText: (v) => v || '—' },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      search: false,
      valueEnum: {
        [AccountStatus.ACTIVE]: { text: 'Active', status: 'Success' },
        [AccountStatus.INACTIVE]: { text: 'Deactive', status: 'Default' },
      },
    },
    {
      title: 'Điểm hiện có',
      dataIndex: 'points',
      valueType: 'digit',
      search: false,
      sorter: (a, b) => a.points - b.points,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      valueType: 'dateTime',
      search: false,
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
    },
    {
      title: 'Thao tác',
      valueType: 'option',
      key: 'option',
      render: (_dom, record) => {
        const actions = [
          <a key="edit" onClick={() => setEditing(record)}>
            Sửa
          </a>,
          <a key="grant" onClick={() => setGranting(record)}>
            Cấp điểm
          </a>,
        ];
        if (record.status === AccountStatus.ACTIVE) {
          actions.push(
            <a key="deactivate" style={{ color: '#d46b08' }} onClick={() => confirmDeactivate(record)}>
              Deactive
            </a>,
          );
        }
        actions.push(
          <a key="delete" style={{ color: '#cf1322' }} onClick={() => confirmDelete(record)}>
            Xoá
          </a>,
        );
        return actions;
      },
    },
  ];

  return (
    <>
      <ProTable<UserRow>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        // The backend already scopes /users to the current Admin(Con); the
        // frontend just fetches. Search/pagination are applied client-side over
        // the cached ['users'] list.
        request={async (params) => {
          const all = await loadUsers(queryClient);
          const byName = (params.username ?? '').toString().toLowerCase();
          const byEmail = (params.email ?? '').toString().toLowerCase();
          let rows = all;
          if (byName) rows = rows.filter((r) => r.username.toLowerCase().includes(byName));
          if (byEmail) rows = rows.filter((r) => (r.email ?? '').toLowerCase().includes(byEmail));
          const current = params.current ?? 1;
          const pageSize = params.pageSize ?? 10;
          const start = (current - 1) * pageSize;
          return { data: rows.slice(start, start + pageSize), total: rows.length, success: true };
        }}
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        headerTitle="Danh sách User"
        toolBarRender={() => [<CreateUserModal key="create" onSuccess={reload} />]}
      />

      <EditUserModal
        record={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onSuccess={reload}
      />
      <GrantUserPointsModal
        record={granting}
        open={granting !== null}
        onOpenChange={(o) => !o && setGranting(null)}
        onSuccess={reload}
      />
    </>
  );
}
