'use client';

import { Select } from 'antd';
import { TEMP_NO_HU_CATEGORIES, type CategoryFilter } from '@/lib/api/lucky-time';

// "Tất cả" = lịch dùng chung (category_id NULL). Danh sách category là DỮ LIỆU TẠM (xem TEMP_NO_HU_CATEGORIES), sẽ lấy từ API.
const ALL = '__all__';

export function CategorySelect({ value, onChange, style }: { value: CategoryFilter; onChange: (v: CategoryFilter) => void; style?: React.CSSProperties }) {
  return (
    <Select
      value={value ?? ALL}
      onChange={(v) => onChange(v === ALL ? null : v)}
      style={{ minWidth: 220, ...style }}
      options={[
        { value: ALL, label: 'Tất cả (dùng chung)' },
        ...TEMP_NO_HU_CATEGORIES.map((c) => ({ value: c.id, label: c.name })),
      ]}
    />
  );
}
