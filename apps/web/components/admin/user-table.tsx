'use client';

import { useRef, useState } from 'react';
import {
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { App, Button, Tooltip } from 'antd';
import {
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  StopOutlined,
} from '@ant-design/icons';
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
      title: 'Deactive người dùng',
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
      title: 'Xoá người dùng',
      content: `Xoá vĩnh viễn "${record.username}"? Hành động không thể hoàn tác.`,
      okText: 'Xoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await remove.mutateAsync(record.id);
          message.success('Đã xoá người dùng');
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
    { title: 'Số điện thoại', dataIndex: 'phoneNumber', ellipsis: true, renderText: (v) => v || '—' },
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
          <Tooltip key="edit" title="Sửa">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => setEditing(record)}
            />
          </Tooltip>,
          <Tooltip key="grant" title="Cấp điểm">
            <Button
              type="text"
              size="small"
              icon={<DollarOutlined />}
              onClick={() => setGranting(record)}
            />
          </Tooltip>,
        ];
        if (record.status === AccountStatus.ACTIVE) {
          actions.push(
            <Tooltip key="deactivate" title="Deactive">
              <Button
                type="text"
                size="small"
                icon={<StopOutlined style={{ color: '#d46b08' }} />}
                onClick={() => confirmDeactivate(record)}
              />
            </Tooltip>,
          );
        }
        actions.push(
          <Tooltip key="delete" title="Xoá">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => confirmDelete(record)}
            />
          </Tooltip>,
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
          const byPhone = (params.phoneNumber ?? '').toString().toLowerCase();
          let rows = all;
          if (byName) rows = rows.filter((r) => r.username.toLowerCase().includes(byName));
          if (byPhone) rows = rows.filter((r) => (r.phoneNumber ?? '').toLowerCase().includes(byPhone));
          const current = params.current ?? 1;
          const pageSize = params.pageSize ?? 10;
          const start = (current - 1) * pageSize;
          return { data: rows.slice(start, start + pageSize), total: rows.length, success: true };
        }}
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        headerTitle="Danh sách người dùng"
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
