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
  EyeOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { AccountStatus } from '@/lib/legacy-types';
import { useActivateUser, useDeleteUser } from '@/lib/api/user';
import {
  useDeactivateSubAdmin,
} from '@/lib/api/sub-admin';
import {
  fetchManagedUsers,
  toManagedUserQuery,
  type ManagedUserRow,
} from '@/lib/api/managed-users';
import { CreateSubAdminModal } from './create-sub-admin-modal';
import { EditSubAdminModal } from './edit-sub-admin-modal';
import { GrantPointsModal } from './grant-points-modal';

export function SubAdminTable() {
  const actionRef = useRef<ActionType>();
  const { message, modal } = App.useApp();
  const activate = useActivateUser();
  const deactivate = useDeactivateSubAdmin();
  const remove = useDeleteUser();

  const [editing, setEditing] = useState<ManagedUserRow | null>(null);
  const [granting, setGranting] = useState<ManagedUserRow | null>(null);

  const reload = () => actionRef.current?.reload();

  const confirmActivate = (record: ManagedUserRow) => {
    modal.confirm({
      title: 'Kích hoạt lại',
      content: `Kích hoạt lại "${record.username}"? Tài khoản sẽ đăng nhập được trở lại.`,
      okText: 'Kích hoạt',
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await activate.mutateAsync(record.id);
          message.success('Đã kích hoạt lại');
          reload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Kích hoạt thất bại');
          throw err;
        }
      },
    });
  };

  const confirmDeactivate = (record: ManagedUserRow) => {
    modal.confirm({
      title: 'Deactive người dùng',
      content: `Vô hiệu hoá "${record.username}"? người dùng sẽ không đăng nhập được.`,
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
          throw err; // keep the modal open on failure
        }
      },
    });
  };

  const confirmDelete = (record: ManagedUserRow) => {
    modal.confirm({
      title: 'Xoá người dùng',
      content: `Xoá "${record.username}"? Tài khoản không thể khôi phục. Điểm còn lại (${record.points}) sẽ được chuyển lại cho bạn.`,
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
    { title: 'Tên', dataIndex: 'displayName', ellipsis: true, search: false, renderText: (v) => v || '—' },
    {
      title: (_, type) => (type === 'form' ? 'Tên / Số điện thoại' : 'Số điện thoại'),
      dataIndex: 'phoneNumber',
      ellipsis: true,
      renderText: (v) => v || '—',
    },
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
          <Tooltip key="detail" title="Chi tiết">
            <Link href={`/host/admins/${record.id}`}>
              <Button type="text" size="small" icon={<EyeOutlined />} />
            </Link>
          </Tooltip>,
        ];
        if (record.depth === 1) {
          actions.push(
          <Tooltip key="edit" title="Sửa">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => setEditing(record)}
            />
          </Tooltip>,
          );
        }
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
        if (record.depth === 1 && record.status === AccountStatus.ACTIVE) {
          actions.push(
            <Tooltip key="deactivate" title="Deactive">
              <Button
                type="text"
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => confirmDeactivate(record)}
              />
            </Tooltip>,
          );
        }
        if (record.depth === 1 && record.status !== AccountStatus.ACTIVE && !record.deleted) {
          actions.push(
            <Tooltip key="activate" title="Kích hoạt lại">
              <Button
                type="text"
                size="small"
                icon={<PlayCircleOutlined style={{ color: '#10B981' }} />}
                onClick={() => confirmActivate(record)}
              />
            </Tooltip>,
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
        }
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
        toolBarRender={() => [
          <CreateSubAdminModal key="create" onSuccess={reload} />,
        ]}
      />

      <EditSubAdminModal
        record={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onSuccess={reload}
      />
      <GrantPointsModal
        record={granting}
        open={granting !== null}
        onOpenChange={(o) => !o && setGranting(null)}
        onSuccess={reload}
      />
    </>
  );
}
