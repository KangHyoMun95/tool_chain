'use client';

import {
  ProCard,
  ProDescriptions,
  ProTable,
  type ProColumns,
} from '@ant-design/pro-components';
import { Skeleton, Space, Tag } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { AccountStatus } from '@toolhackchain/shared';
import type { SubAdminRow } from '@/lib/api/sub-admin';
import {
  loadPointTransactions,
  loadSubAdminUsers,
  useSubAdmin,
  type PointTransactionRow,
  type UserRow,
} from '@/lib/api/sub-admin-detail';

const STATUS_VALUE_ENUM = {
  [AccountStatus.ACTIVE]: { text: 'Active', status: 'Success' as const },
  [AccountStatus.INACTIVE]: { text: 'Deactive', status: 'Default' as const },
};

export function SubAdminDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data: subAdmin, isLoading } = useSubAdmin(id);

  const userColumns: ProColumns<UserRow>[] = [
    { title: 'Tên', dataIndex: 'username', ellipsis: true },
    { title: 'Trạng thái', dataIndex: 'status', valueEnum: STATUS_VALUE_ENUM },
    { title: 'Điểm', dataIndex: 'points', valueType: 'digit' },
    {
      title: 'Trang chủ',
      dataIndex: 'hostnames',
      render: (_dom, r) =>
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
    { title: 'Ngày tạo', dataIndex: 'createdAt', valueType: 'dateTime' },
  ];

  const txColumns: ProColumns<PointTransactionRow>[] = [
    { title: 'Thời gian', dataIndex: 'createdAt', valueType: 'dateTime', width: 180 },
    {
      title: 'Số điểm',
      dataIndex: 'amount',
      width: 120,
      render: (_dom, r) => (
        <Tag color={r.amount >= 0 ? 'green' : 'red'}>
          {r.amount >= 0 ? `+${r.amount}` : r.amount}
        </Tag>
      ),
    },
    { title: 'Người cấp (Admin id)', dataIndex: 'fromAdminId', ellipsis: true, copyable: true },
    { title: 'Lý do', dataIndex: 'reason', ellipsis: true, render: (_d, r) => r.reason || '—' },
  ];

  return (
    <>
      <ProCard title="Thông tin Admin Con" bordered headerBordered style={{ marginBottom: 16 }}>
        {isLoading || !subAdmin ? (
          <Skeleton active />
        ) : (
          <ProDescriptions<SubAdminRow>
            column={2}
            dataSource={subAdmin}
            columns={[
              { title: 'ID', dataIndex: 'id', copyable: true },
              { title: 'Tên đăng nhập', dataIndex: 'username' },
              { title: 'Số điện thoại', dataIndex: 'phoneNumber', render: (_d, r) => r.phoneNumber || '—' },
              { title: 'Trạng thái', dataIndex: 'status', valueEnum: STATUS_VALUE_ENUM },
              { title: 'Điểm hiện có', dataIndex: 'points', valueType: 'digit' },
              { title: 'Ngày tạo', dataIndex: 'createdAt', valueType: 'dateTime' },
            ]}
          />
        )}
      </ProCard>

      <ProCard title="User thuộc Admin Con (chỉ xem)" bordered headerBordered style={{ marginBottom: 16 }}>
        <ProTable<UserRow>
          rowKey="id"
          search={false}
          options={false}
          columns={userColumns}
          pagination={{ pageSize: 10 }}
          request={async () => {
            const rows = await loadSubAdminUsers(queryClient, id);
            return { data: rows, total: rows.length, success: true };
          }}
        />
      </ProCard>

      <ProCard title="Lịch sử cấp điểm" bordered headerBordered>
        <ProTable<PointTransactionRow>
          rowKey="id"
          search={false}
          options={false}
          columns={txColumns}
          pagination={{ pageSize: 10 }}
          request={async () => {
            const rows = await loadPointTransactions(queryClient, id);
            return { data: rows, total: rows.length, success: true };
          }}
        />
      </ProCard>
    </>
  );
}
