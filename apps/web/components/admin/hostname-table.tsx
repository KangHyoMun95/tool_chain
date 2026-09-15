'use client';

import { useRef, useState } from 'react';
import {
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { App, Button, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  loadHostnames,
  useDeleteHostname,
  type HostnameRow,
} from '@/lib/api/hostname';
import { CreateHostnameModal } from './create-hostname-modal';
import { EditHostnameModal } from './edit-hostname-modal';

export function HostnameTable() {
  const actionRef = useRef<ActionType>();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const remove = useDeleteHostname();
  const [editing, setEditing] = useState<HostnameRow | null>(null);
  const reload = () => actionRef.current?.reload();

  const confirmDelete = (record: HostnameRow) => {
    modal.confirm({
      title: 'Xoá trang chủ',
      content: `Xoá "${record.name}"? Trang chủ sẽ được gỡ khỏi mọi user đang gắn.`,
      okText: 'Xoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await remove.mutateAsync(record.id);
          message.success('Đã xoá');
          reload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Xoá thất bại');
          throw err;
        }
      },
    });
  };

  const columns: ProColumns<HostnameRow>[] = [
    { title: 'Tên trang chủ', dataIndex: 'name', ellipsis: true },
    {
      title: 'URL',
      dataIndex: 'url',
      ellipsis: true,
      render: (_dom, r) => (
        <a href={r.url} target="_blank" rel="noreferrer">
          {r.url}
        </a>
      ),
    },
    { title: 'Ngày tạo', dataIndex: 'createdAt', valueType: 'dateTime', search: false, width: 190 },
    {
      title: 'Thao tác',
      valueType: 'option',
      key: 'option',
      width: 110,
      render: (_dom, record) => [
        <Tooltip key="edit" title="Sửa">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} />
        </Tooltip>,
        <Tooltip key="delete" title="Xoá">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(record)} />
        </Tooltip>,
      ],
    },
  ];

  return (
    <>
      <ProTable<HostnameRow>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={false}
        pagination={{ pageSize: 10 }}
        headerTitle="Danh sách trang chủ"
        request={async () => {
          const rows = await loadHostnames(queryClient);
          return { data: rows, total: rows.length, success: true };
        }}
        toolBarRender={() => [<CreateHostnameModal key="create" onSuccess={reload} />]}
      />
      <EditHostnameModal
        record={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onSuccess={reload}
      />
    </>
  );
}
