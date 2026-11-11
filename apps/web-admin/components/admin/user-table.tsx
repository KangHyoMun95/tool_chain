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
import { AccountStatus } from '@/lib/legacy-types';
import {
  useDeactivateUser,
  useDeleteUser,
} from '@/lib/api/user';
import {
  fetchManagedUsers,
  toManagedUserQuery,
  type ManagedUserRow,
} from '@/lib/api/managed-users';
import { CreateUserModal } from './create-user-modal';
import { EditUserModal } from './edit-user-modal';
import { GrantUserPointsModal } from './grant-user-points-modal';

export function UserTable() {
  const actionRef = useRef<ActionType>();
  const { message, modal } = App.useApp();
  const deactivate = useDeactivateUser();
  const remove = useDeleteUser();

  const [editing, setEditing] = useState<ManagedUserRow | null>(null);
  const [granting, setGranting] = useState<ManagedUserRow | null>(null);

  const reload = () => actionRef.current?.reload();

  const confirmDeactivate = (record: ManagedUserRow) => {
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

  const confirmDelete = (record: ManagedUserRow) => {
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

  const columns: ProColumns<ManagedUserRow>[] = [
    { title: 'Số điện thoại', dataIndex: 'phoneNumber', ellipsis: true, renderText: (v) => v || '—' },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      valueEnum: { ADMIN: { text: 'Admin' }, USER: { text: 'User' } },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      valueEnum: {
        [AccountStatus.ACTIVE]: { text: 'Active', status: 'Success' },
        [AccountStatus.INACTIVE]: { text: 'Deactive', status: 'Warning' },
      },
    },
    {
      title: 'Điểm hiện có',
      dataIndex: 'points',
      valueType: 'digit',
      search: false,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      valueType: 'dateTime',
      search: false,
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
        ];
        if (record.depth === 1 && record.status === AccountStatus.ACTIVE) {
          actions.push(
        <Tooltip key="grant" title="Cấp điểm">
          <Button
            type="text"
            size="small"
            icon={<DollarOutlined />}
            onClick={() => setGranting(record)}
          />
        </Tooltip>,
          );
        }
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
      <ProTable<ManagedUserRow>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        request={async (params) => {
          const { rows, total } = await fetchManagedUsers(toManagedUserQuery(params));
          return { data: rows, total, success: true };
        }}
        expandable={{ childrenColumnName: 'children' }}
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
