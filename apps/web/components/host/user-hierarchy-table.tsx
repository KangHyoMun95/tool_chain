'use client';

import {
  ProTable,
  type ProColumns,
} from '@ant-design/pro-components';
import { Tag } from 'antd';
import { TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { AccountStatus } from '@toolhackchain/shared';
import { loadSubAdmins } from '@/lib/api/sub-admin';
import { loadSubAdminUsers } from '@/lib/api/sub-admin-detail';

type RowKind = 'admin-con' | 'user';

interface HierarchyRow {
  key: string;
  kind: RowKind;
  username: string;
  points: number;
  status: AccountStatus;
  createdAt: string;
  children?: HierarchyRow[];
}

const STATUS_VALUE_ENUM = {
  [AccountStatus.ACTIVE]: { text: 'Active', status: 'Success' as const },
  [AccountStatus.INACTIVE]: { text: 'Deactive', status: 'Default' as const },
};

/**
 * Host view: a parent-child (expandable) table of the whole hierarchy — each
 * Admin(Con) is a parent row and the Users it manages
 * (managed_by_admin_con_id) are its child rows.
 */
export function UserHierarchyTable() {
  const qc = useQueryClient();

  const columns: ProColumns<HierarchyRow>[] = [
    {
      title: 'Tên',
      dataIndex: 'username',
      render: (_dom, r) => (
        <span>
          {r.kind === 'admin-con' ? (
            <TeamOutlined style={{ marginRight: 6 }} />
          ) : (
            <UserOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />
          )}
          {r.kind === 'admin-con' ? <strong>{r.username}</strong> : r.username}
        </span>
      ),
    },
    {
      title: 'Loại',
      dataIndex: 'kind',
      width: 120,
      render: (_dom, r) =>
        r.kind === 'admin-con' ? (
          <Tag color="blue">Admin Con</Tag>
        ) : (
          <Tag>User</Tag>
        ),
    },
    { title: 'Điểm hiện có', dataIndex: 'points', valueType: 'digit', width: 130 },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      valueEnum: STATUS_VALUE_ENUM,
    },
    { title: 'Ngày tạo', dataIndex: 'createdAt', valueType: 'dateTime', width: 190 },
  ];

  return (
    <ProTable<HierarchyRow>
      rowKey="key"
      search={false}
      options={false}
      columns={columns}
      pagination={{ pageSize: 10 }}
      headerTitle="Cây quản lý: Admin Con → User"
      expandable={{ childrenColumnName: 'children' }}
      request={async () => {
        const subs = await loadSubAdmins(qc);
        const rows: HierarchyRow[] = await Promise.all(
          subs.map(async (s) => {
            const users = await loadSubAdminUsers(qc, s.id);
            const children: HierarchyRow[] = users.map((u) => ({
              key: `${s.id}:${u.id}`,
              kind: 'user',
              username: u.username,
              points: u.points,
              status: u.status,
              createdAt: u.createdAt,
            }));
            return {
              key: s.id,
              kind: 'admin-con',
              username: s.username,
              points: s.points,
              status: s.status,
              createdAt: s.createdAt,
              // Only attach children when there are users, so parents without
              // users don't render an empty expand control.
              ...(children.length ? { children } : {}),
            };
          }),
        );
        return { data: rows, total: rows.length, success: true };
      }}
    />
  );
}
