'use client';

import { Select } from 'antd';
import { useNoHuCategories, type CategoryFilter } from '@/lib/api/lucky-time';

// "Tất cả" = xem mọi category của lobby NỔ HŨ (không còn lịch dùng chung). Danh sách lấy từ API, khóa theo category_id.
const ALL = '__all__';

export function CategorySelect({ value, onChange, style }: { value: CategoryFilter; onChange: (v: CategoryFilter) => void; style?: React.CSSProperties }) {
  const { data, isLoading } = useNoHuCategories();
  return (
    <Select
      value={value ?? ALL}
      onChange={(v) => onChange(v === ALL ? null : v)}
      loading={isLoading}
      style={{ minWidth: 220, ...style }}
      options={[{ value: ALL, label: 'Tất cả' }, ...(data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
    />
  );
}
