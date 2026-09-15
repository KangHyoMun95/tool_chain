'use client';

import { useRef, useState } from 'react';
import {
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { App, Button, Tooltip } from 'antd';
import {
  DollarOutlined,
  EditOutlined,
  EyeOutlined,
  StopOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { AccountStatus } from '@toolhackchain/shared';
import {
  loadSubAdmins,
  useDeactivateSubAdmin,
  type SubAdminRow,
} from '@/lib/api/sub-admin';
import { CreateSubAdminModal } from './create-sub-admin-modal';
import { EditSubAdminModal } from './edit-sub-admin-modal';
import { GrantPointsModal } from './grant-points-modal';

export function SubAdminTable() {
  const actionRef = useRef<ActionType>();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const deactivate = useDeactivateSubAdmin();

  const [editing, setEditing] = useState<SubAdminRow | null>(null);
  const [granting, setGranting] = useState<SubAdminRow | null>(null);

  const reload = () => actionRef.current?.reload();

  const confirmDeactivate = (record: SubAdminRow) => {
    modal.confirm({
      title: 'Deactive Admin Con',
      content: `Vô hiệu hoá "${record.username}"? Admin Con sẽ không đăng nhập được.`,
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

  const columns: ProColumns<SubAdminRow>[] = [
    { title: 'Tên', dataIndex: 'username', ellipsis: true },
    {
      title: 'Email',
      dataIndex: 'email',
      ellipsis: true,
      renderText: (value) => value || '—',
    },
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
          <Tooltip key="detail" title="Chi tiết">
            <Link href={`/host/admins/${record.id}`}>
              <Button type="text" size="small" icon={<EyeOutlined />} />
            </Link>
          </Tooltip>,
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
                danger
                icon={<StopOutlined />}
                onClick={() => confirmDeactivate(record)}
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
      <ProTable<SubAdminRow>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        // Search (tên/email) + pagination are applied client-side over the
        // cached ['sub-admins'] list, so no page state is managed by hand.
        request={async (params) => {
          const all = await loadSubAdmins(queryClient);
          const byName = (params.username ?? '').toString().toLowerCase();
          const byEmail = (params.email ?? '').toString().toLowerCase();
          let rows = all;
          if (byName) {
            rows = rows.filter((r) =>
              r.username.toLowerCase().includes(byName),
            );
          }
          if (byEmail) {
            rows = rows.filter((r) =>
              (r.email ?? '').toLowerCase().includes(byEmail),
            );
          }
          const current = params.current ?? 1;
          const pageSize = params.pageSize ?? 10;
          const start = (current - 1) * pageSize;
          return {
            data: rows.slice(start, start + pageSize),
            total: rows.length,
            success: true,
          };
        }}
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        headerTitle="Danh sách Admin Con"
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
