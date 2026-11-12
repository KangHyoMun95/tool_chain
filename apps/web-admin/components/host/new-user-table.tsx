'use client';

import { useRef, useState } from 'react';
import { ProTable, type ActionType, type ProColumns } from '@ant-design/pro-components';
import { Button, Tooltip } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import { fetchRegistrations, type RegistrationRow } from '@/lib/api/registrations';
import { ActivateRegistrationModal } from './activate-registration-modal';

export function NewUserTable() {
  const actionRef = useRef<ActionType>();
  const [registering, setRegistering] = useState<RegistrationRow | null>(null);

  const columns: ProColumns<RegistrationRow>[] = [
    { title: 'Số điện thoại', dataIndex: 'phoneNumber' },
    { title: 'Ngày đăng ký', dataIndex: 'createdAt', valueType: 'dateTime', renderText: (v) => v || '—' },
    {
      title: 'Thao tác',
      valueType: 'option',
      key: 'option',
      render: (_dom, record) => [
        <Tooltip key="register" title="Đăng ký">
          <Button type="text" size="small" icon={<UserAddOutlined />} onClick={() => setRegistering(record)} />
        </Tooltip>,
      ],
    },
  ];

  return (
    <>
      <ProTable<RegistrationRow>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        request={async (params) => {
          const { rows, total } = await fetchRegistrations(params.current ?? 1, params.pageSize ?? 10);
          return { data: rows, total, success: true };
        }}
        search={false}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        headerTitle="Số điện thoại chờ cấp tài khoản"
      />
      <ActivateRegistrationModal
        record={registering}
        onClose={() => setRegistering(null)}
        onSuccess={() => { setRegistering(null); actionRef.current?.reload(); }}
      />
    </>
  );
}
