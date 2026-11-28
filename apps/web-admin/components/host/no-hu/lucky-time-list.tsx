'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { UploadOutlined } from '@ant-design/icons';
import { fetchLuckyTimes, formatCircle, formatConfidence, formatRange, formatRtp, type CategoryFilter, type LuckyTimeItem } from '@/lib/api/lucky-time';
import { CategorySelect } from './category-select';

const columns: ColumnsType<LuckyTimeItem> = [
  { title: 'Tên game', key: 'game', width: 160, ellipsis: true, render: (_, r) => r.category_name },
  { title: 'Thời gian dự đoán', dataIndex: 'time_lucky', width: 160, sorter: (a, b) => a.time_lucky.localeCompare(b.time_lucky), defaultSortOrder: 'ascend' },
  { title: 'Khả năng nổ hũ', dataIndex: 'confidence', width: 150, render: formatConfidence, sorter: (a, b) => a.confidence - b.confidence },
  { title: 'Xu hướng hiện tại', dataIndex: 'indicator', render: (v: string | null) => v ?? '—' },
  { title: 'Chu kỳ dự kiến', key: 'circle', render: (_, r) => formatCircle(r) },
  { title: 'Thời điểm đẹp', key: 'range', render: (_, r) => formatRange(r) },
  { title: 'Biến động RTP', dataIndex: 'fluctuations_rtp', width: 150, render: formatRtp },
];

export function LuckyTimeList() {
  const [category, setCategory] = useState<CategoryFilter>(null);
  const [rows, setRows] = useState<LuckyTimeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    fetchLuckyTimes(category)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) { setRows([]); setFailed(true); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => {
      alive = false;
    };
  }, [category]);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {failed && <Alert type="error" showIcon message="Không tải được lịch lucky time. Vui lòng thử lại." />}
      <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <span>Category:</span>
          <CategorySelect value={category} onChange={setCategory} />
        </Space>
        <Link href="/host/no-hu/import">
          <Button type="primary" icon={<UploadOutlined />}>Import lịch</Button>
        </Link>
      </Space>
      <Table<LuckyTimeItem> rowKey="lucky_time_id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} scroll={{ x: 800 }} />
    </Space>
  );
}
