'use client';

import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { CatalogStatus } from '@toolhackchain/shared';
import { fetchStreams, type StreamRow } from '@/lib/api/catalog';

const STATUS_COLOR: Record<CatalogStatus, string> = {
  [CatalogStatus.ACTIVE]: 'green',
  [CatalogStatus.DEACTIVE]: 'orange',
  [CatalogStatus.ARCHIVE]: 'default',
};

const columns: ProColumns<StreamRow>[] = [
  { title: 'Tên bàn', dataIndex: 'q', hideInTable: true, fieldProps: { placeholder: 'Tìm theo tên bàn' } },
  { title: 'Sảnh', dataIndex: 'lobby_name', search: false },
  { title: 'Loại game', dataIndex: 'category_name', search: false },
  { title: 'Bàn', dataIndex: 'stream_name', search: false },
  { title: 'Streamer', dataIndex: 'streamer_id', search: false, renderText: (v) => v ?? '—' },
  {
    title: 'Trạng thái',
    dataIndex: 'status',
    valueEnum: Object.fromEntries(Object.values(CatalogStatus).map((s) => [s, { text: s }])),
    render: (_, row) => <Tag color={STATUS_COLOR[row.status]}>{row.status}</Tag>,
  },
];

/** Danh sách bàn (GET /streams, chỉ đọc). HOST / ADMIN thấy mọi trạng thái. */
export function StreamCatalog() {
  return (
    <ProTable<StreamRow>
      rowKey="stream_id"
      columns={columns}
      search={{ labelWidth: 'auto' }}
      options={false}
      pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      request={async (params) => {
        const res = await fetchStreams({
          page: params.current ?? 1,
          limit: params.pageSize ?? 20,
          q: params.q as string | undefined,
          status: params.status as CatalogStatus | undefined,
        });
        return { data: res.items, total: res.total, success: true };
      }}
    />
  );
}
