'use client';

import { useEffect, useState } from 'react';
import { Empty, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { AccountStatus } from '@toolhackchain/shared';
import { loadSubAdminUsers, type UserRow } from '@/lib/api/sub-admin-detail';

/**
 * Read-only nested table of the Users managed by one Admin(Con), rendered as an
 * expandable row on the Host's list. Loaded lazily when the row is expanded.
 */
export function SubAdminUsersPanel({ subAdminId }: { subAdminId: string }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<UserRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSubAdminUsers(queryClient, subAdminId).then((users) => {
      if (!cancelled) setRows(users);
    });
    return () => {
      cancelled = true;
    };
  }, [queryClient, subAdminId]);

  const columns: ColumnsType<UserRow> = [
    { title: 'Tên', dataIndex: 'username', ellipsis: true },
    {
      title: 'Số điện thoại',
      dataIndex: 'phoneNumber',
      width: 150,
      render: (v: string | null) => v || '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (status: AccountStatus) =>
        status === AccountStatus.ACTIVE ? (
          <Tag color="success">Active</Tag>
        ) : (
          <Tag>Deactive</Tag>
        ),
    },
    { title: 'Điểm', dataIndex: 'points', width: 100 },
    {
      title: 'Trang chủ',
      dataIndex: 'hostnames',
      render: (_: unknown, r: UserRow) =>
        r.hostnames?.length ? (
          <Space size={[0, 4]} wrap>
            {r.hostnames.map((h) => (
              <Tag key={h.id} color="geekblue">
                {h.name}
              </Tag>
            ))}
          </Space>
        ) : (
          '—'
        ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      width: 190,
      render: (v: string) => new Date(v).toLocaleString('vi-VN'),
    },
  ];

  return (
    <Table<UserRow>
      size="small"
      rowKey="id"
      loading={rows === null}
      dataSource={rows ?? []}
      columns={columns}
      pagination={false}
      locale={{ emptyText: <Empty description="Chưa có User" /> }}
    />
  );
}
