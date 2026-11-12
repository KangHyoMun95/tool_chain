'use client';

import {
  ProCard,
  ProDescriptions,
  ProTable,
  type ProColumns,
} from '@ant-design/pro-components';
import { Skeleton, Tag } from 'antd';
import { AccountStatus } from '@/lib/legacy-types';
import type { SubAdminRow } from '@/lib/api/sub-admin';
import {
  fetchPointTransactions,
  fetchSubAdminUsers,
  useSubAdmin,
  type PointTransactionRow,
  type UserRow,
} from '@/lib/api/sub-admin-detail';

const STATUS_VALUE_ENUM = {
  [AccountStatus.ACTIVE]: { text: 'Active', status: 'Success' as const },
  [AccountStatus.INACTIVE]: { text: 'Deactive', status: 'Default' as const },
};

export function SubAdminDetail({ id }: { id: string }) {
  const { data: subAdmin, isLoading } = useSubAdmin(id);

  const userColumns: ProColumns<UserRow>[] = [
    { title: 'Tên', dataIndex: 'displayName', ellipsis: true, render: (_d, r) => r.displayName || '—' },
    { title: 'Số điện thoại', dataIndex: 'phoneNumber', ellipsis: true },
    { title: 'Trạng thái', dataIndex: 'status', valueEnum: STATUS_VALUE_ENUM },
    { title: 'Điểm', dataIndex: 'points', valueType: 'digit' },
    { title: 'Ngày tạo', dataIndex: 'createdAt', valueType: 'dateTime' },
  ];

  const txColumns: ProColumns<PointTransactionRow>[] = [
    { title: 'Thời gian', dataIndex: 'createdAt', valueType: 'dateTime', width: 180 },
    {
      title: 'Số điểm',
      dataIndex: 'amount',
      width: 120,
      render: (_dom, r) => <Tag color="green">+{r.amount}</Tag>,
    },
    { title: 'Người cấp', dataIndex: 'granterName', ellipsis: true, render: (_d, r) => r.granterName || '—' },
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
              { title: 'Tên', dataIndex: 'displayName', render: (_d, r) => r.displayName || '—' },
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
          request={async (params) => {
            const { rows, total } = await fetchSubAdminUsers(id, params.current ?? 1, params.pageSize ?? 10);
            return { data: rows, total, success: true };
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
          request={async (params) => {
            const { rows, total } = await fetchPointTransactions(id, params.current ?? 1, params.pageSize ?? 10);
            return { data: rows, total, success: true };
          }}
        />
      </ProCard>
    </>
  );
}
